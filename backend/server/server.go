package server

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/chatcloud/backend/proto"
)

// ChatCloudServer implements the ChatCloud gRPC service
type ChatCloudServer struct {
	// UnimplementedChatCloudServer must be embedded to have forward compatible implementations
	proto.UnimplementedChatCloudServer

	rdb           *redis.Client
	roomStreams   map[string]map[string]chan *proto.Message
	roomStreamsMu sync.RWMutex
}

// NewChatCloudServer creates a new ChatCloudServer
func NewChatCloudServer(rdb *redis.Client) *ChatCloudServer {
	return &ChatCloudServer{
		rdb:         rdb,
		roomStreams: make(map[string]map[string]chan *proto.Message),
	}
}

// JoinRoom allows a user to join a chat room
func (s *ChatCloudServer) JoinRoom(ctx context.Context, req *proto.JoinRoomRequest) (*proto.JoinRoomResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	if req.RoomId == "" {
		return nil, status.Error(codes.InvalidArgument, "room_id is required")
	}

	// Add user to room in Redis
	err := s.rdb.SAdd(ctx, "room:"+req.GetRoomId()+":users", req.GetUserId()).Err()
	if err != nil {
		log.Printf("Error adding user to room: %v", err)
		return nil, status.Error(codes.Internal, "failed to join room")
	}

	// Add room to user's rooms in Redis
	err = s.rdb.SAdd(ctx, "user:"+req.GetUserId()+":rooms", req.GetRoomId()).Err()
	if err != nil {
		log.Printf("Error adding room to user's rooms: %v", err)
		return nil, status.Error(codes.Internal, "failed to join room")
	}

	// Get recent messages from Redis
	messageIDs, err := s.rdb.LRange(ctx, "room:"+req.GetRoomId()+":messages", 0, 49).Result()
	if err != nil {
		log.Printf("Error getting recent messages: %v", err)
		return nil, status.Error(codes.Internal, "failed to get recent messages")
	}

	// Fetch message details for each message ID
	var recentMessages []*proto.Message
	for _, msgID := range messageIDs {
		msgMap, err := s.rdb.HGetAll(ctx, "message:"+msgID).Result()
		if err != nil {
			log.Printf("Error getting message details: %v", err)
			continue
		}

		// Parse timestamp
		timestamp, err := time.Parse(time.RFC3339, msgMap["timestamp"])
		if err != nil {
			log.Printf("Error parsing timestamp: %v", err)
			continue
		}

		msg := &proto.Message{
			Id:        msgID,
			UserId:    msgMap["user_id"],
			RoomId:    msgMap["room_id"],
			Content:   msgMap["content"],
			Timestamp: timestamp.UnixNano() / int64(time.Millisecond),
		}
		recentMessages = append(recentMessages, msg)
	}

	return &proto.JoinRoomResponse{
		Success:        true,
		RecentMessages: recentMessages,
	}, nil
}

// SendMessage allows a user to send a message to a room
func (s *ChatCloudServer) SendMessage(ctx context.Context, req *proto.SendMessageRequest) (*proto.SendMessageResponse, error) {
	if req.GetUserId() == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	if req.GetRoomId() == "" {
		return nil, status.Error(codes.InvalidArgument, "room_id is required")
	}
	if req.GetContent() == "" {
		return nil, status.Error(codes.InvalidArgument, "content is required")
	}

	// Check if user is in the room
	isMember, err := s.rdb.SIsMember(ctx, "room:"+req.GetRoomId()+":users", req.GetUserId()).Result()
	if err != nil {
		log.Printf("Error checking if user is in room: %v", err)
		return nil, status.Error(codes.Internal, "failed to send message")
	}
	if !isMember {
		return nil, status.Error(codes.PermissionDenied, "user is not in the room")
	}

	// Create message
	msgID := uuid.New().String()
	now := time.Now()
	msg := &proto.Message{
		Id:        msgID,
		UserId:    req.GetUserId(),
		RoomId:    req.GetRoomId(),
		Content:   req.GetContent(),
		Timestamp: now.UnixNano() / int64(time.Millisecond),
	}

	// Store message in Redis
	_, err = s.rdb.HSet(ctx, "message:"+msgID, map[string]interface{}{
		"user_id":   req.GetUserId(),
		"room_id":   req.GetRoomId(),
		"content":   req.GetContent(),
		"timestamp": now.Format(time.RFC3339),
	}).Result()
	if err != nil {
		log.Printf("Error storing message: %v", err)
		return nil, status.Error(codes.Internal, "failed to send message")
	}

	// Add message ID to room's message list
	err = s.rdb.LPush(ctx, "room:"+req.GetRoomId()+":messages", msgID).Err()
	if err != nil {
		log.Printf("Error adding message to room: %v", err)
		return nil, status.Error(codes.Internal, "failed to send message")
	}

	// Trim message list to keep only the most recent 1000 messages
	err = s.rdb.LTrim(ctx, "room:"+req.GetRoomId()+":messages", 0, 999).Err()
	if err != nil {
		log.Printf("Error trimming message list: %v", err)
	}

	// Publish message to Redis channel for the room
	err = s.rdb.Publish(ctx, "room:"+req.GetRoomId(), msgID).Err()
	if err != nil {
		log.Printf("Error publishing message: %v", err)
	}

	// Broadcast message to all connected clients
	s.broadcastMessage(msg)

	return &proto.SendMessageResponse{
		Success: true,
		Message: msg,
	}, nil
}

// StreamMessages allows a user to receive messages from a room in real-time
func (s *ChatCloudServer) StreamMessages(req *proto.StreamMessagesRequest, stream proto.ChatCloud_StreamMessagesServer) error {
	if req.GetUserId() == "" {
		return status.Error(codes.InvalidArgument, "user_id is required")
	}
	if req.GetRoomId() == "" {
		return status.Error(codes.InvalidArgument, "room_id is required")
	}

	// Use the stream's context to ensure proper cleanup
	ctx := stream.Context()

	// Check if user is in the room
	isMember, err := s.rdb.SIsMember(ctx, "room:"+req.GetRoomId()+":users", req.GetUserId()).Result()
	if err != nil {
		log.Printf("Error checking if user is in room: %v", err)
		return status.Error(codes.Internal, "failed to stream messages")
	}
	if !isMember {
		return status.Error(codes.PermissionDenied, "user is not in the room")
	}

	// Create a channel for this user in this room with a larger buffer
	msgChan := make(chan *proto.Message, 200)

	// Register the stream with improved handling of existing channels
	s.roomStreamsMu.Lock()
	if _, ok := s.roomStreams[req.GetRoomId()]; !ok {
		s.roomStreams[req.GetRoomId()] = make(map[string]chan *proto.Message)
	}
	
	// If there's an existing channel for this user, close it safely
	if existingChan, exists := s.roomStreams[req.GetRoomId()][req.GetUserId()]; exists {
		log.Printf("Found existing stream for user %s in room %s, closing it safely", req.GetUserId(), req.GetRoomId())
		// Safely close the existing channel
		func(ch chan *proto.Message) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Recovered from panic when closing existing channel: %v", r)
				}
			}()
			// Try to close the channel only if it's not already closed
			select {
			case _, ok := <-ch:
				if ok {
					close(ch)
				}
			default:
				// Try to close, but recover if it panics
				func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("Channel was already closed: %v", r)
						}
					}()
					close(ch)
				}()
			}
		}(existingChan)
	}
	
	// Register the new channel
	s.roomStreams[req.GetRoomId()][req.GetUserId()] = msgChan
	log.Printf("Registered new stream for user %s in room %s", req.GetUserId(), req.GetRoomId())
	s.roomStreamsMu.Unlock()

	// Track whether the channel has been closed to avoid double-closing
	var (closed bool = false
	     closeMutex sync.Mutex)
	
	// Cleanup function to ensure proper resource release
	cleanup := func() {
		// Remove the user's stream from our map
		s.roomStreamsMu.Lock()
		delete(s.roomStreams[req.GetRoomId()], req.GetUserId())
		if len(s.roomStreams[req.GetRoomId()]) == 0 {
			delete(s.roomStreams, req.GetRoomId())
		}
		s.roomStreamsMu.Unlock()
		
		// Close the message channel if it's not already closed
		closeMutex.Lock()
		defer closeMutex.Unlock()
		
		if !closed {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Recovered from panic when closing channel: %v", r)
				}
			}()
			
			// Mark as closed before actually closing to prevent double-close attempts
			closed = true
			log.Printf("Closing message channel for user %s in room %s", req.GetUserId(), req.GetRoomId())
			close(msgChan)
		} else {
			log.Printf("Channel already closed for user %s in room %s", req.GetUserId(), req.GetRoomId())
		}
		
		log.Printf("Cleaned up resources for user %s in room %s", req.GetUserId(), req.GetRoomId())
	}

	// Make sure to clean up when we're done
	defer cleanup()

	// Create a separate background context for Redis subscription with a timeout
	// This ensures that even if there's an issue, the context will eventually be cancelled
	redisCtx, redisCancel := context.WithTimeout(context.Background(), 1*time.Hour)
	
	// Make sure to cancel the Redis context when we're done with the stream
	defer func() {
		log.Printf("Cancelling Redis context for user %s in room %s", req.GetUserId(), req.GetRoomId())
		redisCancel()
	}()
	
	// Subscribe to Redis channel for the room using the separate context
	pubsub := s.rdb.Subscribe(redisCtx, "room:"+req.GetRoomId())
	defer pubsub.Close()

	// Start a goroutine to listen for Redis messages
	redisErrChan := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Recovered from panic in Redis message handler: %v", r)
				redisErrChan <- fmt.Errorf("redis handler panic: %v", r)
			}
		}()

		ch := pubsub.Channel()
		for {
			select {
			case <-redisCtx.Done():
				log.Printf("Redis context cancelled, exiting Redis subscription goroutine for user %s in room %s", req.GetUserId(), req.GetRoomId())
				return
			case msg, ok := <-ch:
				if !ok {
					log.Printf("Redis subscription channel closed for user %s in room %s", req.GetUserId(), req.GetRoomId())
					return
				}

				// Get message details using the Redis context
				msgID := msg.Payload
				msgMap, err := s.rdb.HGetAll(redisCtx, "message:"+msgID).Result()
				if err != nil {
					log.Printf("Error getting message details: %v", err)
					continue
				}

				// Parse timestamp
				timestamp, err := time.Parse(time.RFC3339, msgMap["timestamp"])
				if err != nil {
					log.Printf("Error parsing timestamp: %v", err)
					continue
				}

				// Create the message
				protoMsg := &proto.Message{
					Id:        msgID,
					UserId:    msgMap["user_id"],
					RoomId:    msgMap["room_id"],
					Content:   msgMap["content"],
					Timestamp: timestamp.UnixNano() / int64(time.Millisecond),
				}

				// Send message to the channel if it's still open
				select {
				case msgChan <- protoMsg:
					// Successfully sent
				case <-redisCtx.Done():
					log.Printf("Redis context cancelled while sending message")
					return
				case <-ctx.Done():
					log.Printf("Stream context cancelled while sending message")
					return
				default:
					log.Printf("Channel full for user %s in room %s, dropping message", req.GetUserId(), req.GetRoomId())
				}
			}
		}
	}()

	// Set up keep-alive mechanism with shorter interval
	keepAliveTicker := time.NewTicker(10 * time.Second)
	defer keepAliveTicker.Stop()

	// Create an empty keep-alive message
	keepAliveMsg := &proto.Message{
		Id:        "keep-alive",
		UserId:    req.GetUserId(),
		RoomId:    req.GetRoomId(),
		Content:   "", // Empty content for keep-alive
		Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
	}

	// Send an initial keep-alive message immediately
	if err := stream.Send(keepAliveMsg); err != nil {
		log.Printf("Error sending initial keep-alive message: %v", err)
		return err
	}

	// Main loop to process messages and keep-alives
	for {
		select {
		case <-ctx.Done():
			log.Printf("Stream context done for user %s in room %s", req.GetUserId(), req.GetRoomId())
			return nil
		case err := <-redisErrChan:
			log.Printf("Redis error for user %s in room %s: %v", req.GetUserId(), req.GetRoomId(), err)
			return status.Error(codes.Internal, "redis subscription error")
		case msg, ok := <-msgChan:
			if !ok {
				log.Printf("Message channel closed for user %s in room %s", req.GetUserId(), req.GetRoomId())
				return nil
			}
			if err := stream.Send(msg); err != nil {
				log.Printf("Error sending message to user %s in room %s: %v", req.GetUserId(), req.GetRoomId(), err)
				return err
			}
		case <-keepAliveTicker.C:
			// Update the timestamp to current time
			keepAliveMsg.Timestamp = time.Now().UnixNano() / int64(time.Millisecond)
			if err := stream.Send(keepAliveMsg); err != nil {
				log.Printf("Error sending keep-alive to user %s in room %s: %v", req.GetUserId(), req.GetRoomId(), err)
				return err
			}
		}
	}
}

// LeaveRoom allows a user to leave a chat room
func (s *ChatCloudServer) LeaveRoom(ctx context.Context, req *proto.LeaveRoomRequest) (*proto.LeaveRoomResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	if req.RoomId == "" {
		return nil, status.Error(codes.InvalidArgument, "room_id is required")
	}

	// Remove user from room in Redis
	err := s.rdb.SRem(ctx, "room:"+req.GetRoomId()+":users", req.GetUserId()).Err()
	if err != nil {
		log.Printf("Error removing user from room: %v", err)
		return nil, status.Error(codes.Internal, "failed to leave room")
	}

	// Remove room from user's rooms in Redis
	err = s.rdb.SRem(ctx, "user:"+req.GetUserId()+":rooms", req.GetRoomId()).Err()
	if err != nil {
		log.Printf("Error removing room from user's rooms: %v", err)
		return nil, status.Error(codes.Internal, "failed to leave room")
	}

	// Remove user's stream if it exists
	s.roomStreamsMu.Lock()
	if roomStreams, ok := s.roomStreams[req.GetRoomId()]; ok {
		if msgChan, ok := roomStreams[req.GetUserId()]; ok {
			close(msgChan)
			delete(roomStreams, req.GetUserId())
		}
		if len(roomStreams) == 0 {
			delete(s.roomStreams, req.GetRoomId())
		}
	}
	s.roomStreamsMu.Unlock()

	return &proto.LeaveRoomResponse{
		Success: true,
	}, nil
}

// broadcastMessage sends a message to all connected clients in a room
func (s *ChatCloudServer) broadcastMessage(msg *proto.Message) {
	s.roomStreamsMu.RLock()
	defer s.roomStreamsMu.RUnlock()

	if roomStreams, ok := s.roomStreams[msg.RoomId]; ok {
		for _, msgChan := range roomStreams {
			select {
			case msgChan <- msg:
			default:
				log.Printf("Channel full, dropping message")
			}
		}
	}
}


