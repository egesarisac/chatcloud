// Import proto files and gRPC transport
import { ChatCloudClient } from './proto/chatcloud.client.ts';
import * as proto from './proto/chatcloud.ts';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';

// Flag to use mock implementation for development without backend
// Using real backend implementation
const USE_MOCK = false;

// Create a proper gRPC-Web transport
// Using Envoy as a proxy for gRPC-Web translation
const transport = new GrpcWebFetchTransport({
  baseUrl: 'http://localhost:8080',
  // Add debug mode and increase timeouts
  debug: true,
  timeout: 10000, // 10 seconds timeout for long operations
});

// Create a client instance with the transport
const client = USE_MOCK ? null : new ChatCloudClient(transport);

// Mock data for development
const mockMessages = {};
const mockStreamCallbacks = {};

export default {
  /**
   * Share a topic with other users
   * @param {string} userId - The user ID who created the topic
   * @param {Object} topic - The topic object with text, roomId, and size
   * @returns {Promise} - Promise that resolves when topic is shared
   */
  async shareTopic(userId, topic) {
    try {
      if (USE_MOCK) {
        console.log(`[MOCK] Sharing topic ${topic.text} as user ${userId}`);
        return { success: true };
      }
      
      // Use the sendMessage API to share topics with a special format
      // Format: "TOPIC:{text}:{roomId}:{size}"
      const topicMessage = `TOPIC:${topic.text}:${topic.roomId}:${topic.size}`;
      
      return await this.sendMessage(userId, 'global-topics', topicMessage);
    } catch (error) {
      console.error('Error sharing topic:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Join a chat room
   * @param {string} userId - The user ID
   * @param {string} roomId - The room ID
   * @returns {Promise} - Promise that resolves with the join room response
   */
  async joinRoom(userId, roomId) {
    try {
      if (USE_MOCK) {
        console.log(`[MOCK] Joining room ${roomId} as user ${userId}`);
        
        // Initialize room if it doesn't exist
        if (!mockMessages[roomId]) {
          mockMessages[roomId] = [];
          
          // Add some sample messages for the room
          mockMessages[roomId].push({
            id: '1',
            userId: 'system',
            roomId: roomId,
            content: `Welcome to the ${roomId} room!`,
            timestamp: new Date().toISOString()
          });
        }
        
        // Return success with mock messages
        return {
          success: true,
          recentMessages: mockMessages[roomId]
        };
      }
      
      // Real implementation
      const request = {
        userId: userId,
        roomId: roomId
      };

      const call = client.joinRoom(request);
      const response = await call.response;

      const messages = response.recentMessages.map(msg => ({
        id: msg.id,
        userId: msg.userId,
        roomId: msg.roomId,
        content: msg.content,
        timestamp: msg.timestamp
      }));

      return {
        success: response.success,
        recentMessages: messages
      };
    } catch (err) {
      console.error('Error joining room:', err);
      if (USE_MOCK) {
        // Return success with empty messages in mock mode
        return {
          success: true,
          recentMessages: []
        };
      }
      throw err;
    }
  },

  /**
   * Send a message to a chat room
   * @param {string} userId - The user ID
   * @param {string} roomId - The room ID
   * @param {string} content - The message content
   * @returns {Promise} - Promise that resolves with the send message response
   */
  async sendMessage(userId, roomId, content) {
    try {
      if (USE_MOCK) {
        console.log(`[MOCK] Sending message to room ${roomId} as user ${userId}: ${content}`);
        
        // Initialize room if it doesn't exist
        if (!mockMessages[roomId]) {
          mockMessages[roomId] = [];
        }
        
        // Create a new message
        const messageId = Date.now().toString();
        const message = {
          id: messageId,
          userId: userId,
          roomId: roomId,
          content: content,
          timestamp: new Date().toISOString()
        };
        
        // Add to mock messages
        mockMessages[roomId].push(message);
        
        // Notify any active stream listeners
        if (mockStreamCallbacks[roomId]) {
          mockStreamCallbacks[roomId].forEach(callback => {
            callback(message);
          });
        }
        
        return {
          success: true,
          messageId: messageId
        };
      }
      
      // Real implementation
      const request = {
        userId: userId,
        roomId: roomId,
        content: content
      };

      const call = client.sendMessage(request);
      const response = await call.response;

      // Generate a client-side message ID if the server doesn't provide one
      const messageId = response.messageId || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return {
        success: response.success,
        messageId: messageId
      };
    } catch (err) {
      console.error('Error sending message:', err);
      if (USE_MOCK) {
        // Return success with fake message ID in mock mode
        return {
          success: true,
          messageId: Date.now().toString()
        };
      }
      throw err;
    }
  },

  /**
   * Stream messages from a chat room
   * @param {string} userId - The user ID
   * @param {string} roomId - The room ID
   * @param {function} onMessage - Callback function for new messages
   * @returns {object} - Stream object with cancel method
   */
  streamMessages(userId, roomId, onMessage) {
    // Create a cancellable object that we'll return immediately
    let cancelled = false;
    // Define activeCall in the outer scope so it's accessible in the cancel function
    let activeCall = null;
    // Track connection failures to fall back to mock mode if needed
    let failureCount = 0;
    const MAX_FAILURES = 2;
    
    const cancelObject = {
      cancel: () => {
        cancelled = true;
        if (activeCall && typeof activeCall.cancel === 'function') {
          console.log(`Cancelling message stream for room ${roomId}`);
          activeCall.cancel();
        }
      }
    };
    
    try {
      if (USE_MOCK) {
        console.log(`[MOCK] Setting up message stream for room ${roomId} as user ${userId}`);
        
        // Initialize room if it doesn't exist
        if (!mockMessages[roomId]) {
          mockMessages[roomId] = [];
        }
        
        // Initialize callbacks array for this room if it doesn't exist
        if (!mockStreamCallbacks[roomId]) {
          mockStreamCallbacks[roomId] = [];
        }
        
        // Add callback to the array
        mockStreamCallbacks[roomId].push(onMessage);
        
        // Update cancel function for mock mode
        cancelObject.cancel = () => {
          console.log(`[MOCK] Cancelling message stream for room ${roomId}`);
          // Remove callback from the array
          if (mockStreamCallbacks[roomId]) {
            const index = mockStreamCallbacks[roomId].indexOf(onMessage);
            if (index !== -1) {
              mockStreamCallbacks[roomId].splice(index, 1);
            }
          }
        };
        
        return cancelObject;
      }
      
      // Store the active call so we can cancel it if needed
      let activeCall = null;
      
      // Function to set up the stream
      const setupStream = () => {
        if (cancelled) return; // Don't set up if already cancelled
        
        const request = {
          userId: userId,
          roomId: roomId
        };
        
        try {
          console.log(`Setting up message stream for room ${roomId} as user ${userId}`);
          
          // Configure the gRPC client with more appropriate timeout settings
          // Only try to configure the transport if it exists
          try {
            if (client.transport && typeof client.transport === 'object') {
              // Use a longer timeout for global-topics to make it more stable
              client.transport.timeoutMillis = roomId === 'global-topics' ? 60000 : 0;
            }
          } catch (e) {
            console.warn('Could not configure transport timeouts:', e);
          }
          
          // Create the stream without custom metadata to avoid CORS issues
          activeCall = client.streamMessages(request);
          
          // Reset failure count on successful connection
          failureCount = 0;
          
          // Set up a keep-alive ping to prevent timeouts
          // Use a longer interval for global-topics to reduce unnecessary pings
          const pingInterval = setInterval(() => {
            if (cancelled) {
              clearInterval(pingInterval);
              return;
            }
            
            // Send a ping by calling a harmless method on the activeCall object
            if (activeCall && typeof activeCall.headers === 'function') {
              try {
                activeCall.headers();
                // Only log pings in debug mode to reduce console noise
                if (roomId !== 'global-topics') {
                  console.log(`Ping sent for stream in room ${roomId}`);
                }
              } catch (e) {
                // Ignore errors during ping
              }
            }
          }, roomId === 'global-topics' ? 30000 : 15000); // 30 seconds for global-topics, 15 for others
          
          // Make sure to clear the interval when the stream ends
          const clearPingInterval = () => {
            clearInterval(pingInterval);
          };
          
          activeCall.responses.onMessage(message => {
            if (cancelled) return;
            
            // Skip keep-alive messages from the server
            if (message.id === 'keep-alive') {
              console.log(`Received keep-alive from server for room ${roomId}`);
              return;
            }
            
            console.log(`Received message in room ${roomId}:`, message);
            onMessage({
              id: message.id,
              userId: message.userId,
              roomId: message.roomId,
              content: message.content,
              timestamp: message.timestamp
            });
          });
          
          activeCall.responses.onError(err => {
            console.error('Stream error:', err);
            clearPingInterval();
            failureCount++;
            
            // If we get a "user is not in the room" error or any other error, try to rejoin and restart the stream
            if (!cancelled) {
              // More aggressive backoff for the first few attempts
              const backoffTime = failureCount <= 3 ? 500 : Math.min(failureCount * 1000, 5000);
              console.log(`Attempting to rejoin room and restart stream in ${backoffTime}ms (attempt ${failureCount})...`);
              
              setTimeout(() => {
                if (!cancelled) {
                  this.joinRoom(userId, roomId)
                    .then(() => {
                      console.log(`Successfully rejoined room ${roomId}, restarting stream...`);
                      setupStream();
                    })
                    .catch(joinErr => {
                      console.error('Error rejoining room:', joinErr);
                      // Try again later if join fails
                      if (!cancelled && failureCount < 15) { // Increased retry limit
                        setTimeout(setupStream, 1000);
                      }
                    });
                }
              }, backoffTime);
            }
          });
          
          activeCall.responses.onComplete(() => {
            console.log(`Stream ended for room ${roomId}`);
            clearPingInterval();
            
            // If the stream completes but we didn't cancel it, attempt to reconnect
            // But only if it's not a global-topics room (which is expected to have more stable connection)
            if (!cancelled) {
              // Use exponential backoff for reconnection attempts
              const backoffTime = roomId === 'global-topics' ? 5000 : 1000;
              console.log(`Stream completed unexpectedly for room ${roomId}, attempting to reconnect in ${backoffTime}ms...`);
              setTimeout(() => {
                if (!cancelled) {
                  setupStream();
                }
              }, backoffTime);
            }
          });
        } catch (streamErr) {
          console.error('Error setting up stream:', streamErr);
        }
      };
      
      // First join the room, then set up the stream
      this.joinRoom(userId, roomId)
        .then(() => {
          if (!cancelled) {
            // Add a small delay to ensure the server has processed the join
            setTimeout(setupStream, 500);
          }
        })
        .catch(joinErr => {
          console.error('Error joining room before streaming:', joinErr);
        });
      
      return cancelObject;
    } catch (err) {
      console.error('Error setting up message stream:', err);
      return cancelObject;
    }
  },

  /**
   * Stream topic updates from other users
   * @param {string} userId - The user ID
   * @param {function} onTopicUpdate - Callback function for new topics
   * @returns {object} - Stream object with cancel method
   */
  streamTopicUpdates(userId, onTopicUpdate) {
    try {
      if (USE_MOCK) {
        console.log(`[MOCK] Streaming topic updates for user ${userId}`);
        
        // Return a mock stream object with cancel method
        return {
          cancel: () => {
            console.log(`[MOCK] Cancelled topic stream for user ${userId}`);
          }
        };
      }
      
      // Use the existing streamMessages API to listen for topic updates
      // on a special 'global-topics' room
      const stream = this.streamMessages(userId, 'global-topics', (message) => {
        // Check if this is a topic message (starts with 'TOPIC:')
        if (message.content && message.content.startsWith('TOPIC:')) {
          try {
            // Parse the topic message
            // Format: "TOPIC:{text}:{roomId}:{size}"
            const parts = message.content.split(':');
            if (parts.length >= 4) {
              const topic = {
                text: parts[1],
                roomId: parts[2],
                size: parseInt(parts[3], 10),
                createdBy: message.userId,
                timestamp: message.timestamp
              };
              
              // Call the callback with the topic
              onTopicUpdate(topic);
            }
          } catch (error) {
            console.error('Error parsing topic message:', error);
          }
        }
      });
      
      return stream;
    } catch (error) {
      console.error('Error streaming topic updates:', error);
      return {
        cancel: () => {}
      };
    }
  },

  /**
   * Leave a chat room
   * @param {string} userId - The user ID
   * @param {string} roomId - The room ID
   * @returns {Promise} - Promise that resolves with the leave room response
   */
  async leaveRoom(userId, roomId) {
    try {
      if (USE_MOCK) {
        console.log(`[MOCK] Leaving room ${roomId} as user ${userId}`);
        
        // Remove user's callbacks from the stream callbacks
        if (mockStreamCallbacks[roomId]) {
          // In a real implementation, we would filter by userId
          // but for mock purposes, we'll just log it
          console.log(`[MOCK] User ${userId} no longer receiving messages from room ${roomId}`);
        }
        
        return {
          success: true
        };
      }
      
      // Real implementation
      const request = {
        userId: userId,
        roomId: roomId
      };

      const call = client.leaveRoom(request);
      const response = await call.response;

      return {
        success: response.success
      };
    } catch (err) {
      console.error('Error leaving room:', err);
      if (USE_MOCK) {
        // Return success in mock mode
        return {
          success: true
        };
      }
      throw err;
    }
  }
};
