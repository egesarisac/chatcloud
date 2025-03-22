package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/chatcloud/backend/proto"
	"github.com/chatcloud/backend/server"
	"github.com/go-redis/redis/v8"
	"google.golang.org/grpc"
)

const (
	port = ":50051"
)

func main() {
	// Create a listener on TCP port
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	// Create a gRPC server object
	s := grpc.NewServer()

	// Initialize Redis client
	// Get Redis address from environment variable or use the Docker service name
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "redis:6379"
	}
	
	rdb := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	// Test Redis connection
	ctx := context.Background()
	_, err = rdb.Ping(ctx).Result()
	if err != nil {
		log.Printf("Warning: Redis connection failed: %v", err)
		log.Println("Continuing without Redis - some features may not work correctly")
	} else {
		log.Println("Connected to Redis successfully")
	}

	// Create a new ChatCloud server
	chatServer := server.NewChatCloudServer(rdb)

	// Register our service with the gRPC server
	proto.RegisterChatCloudServer(s, chatServer)

	// Start the server
	log.Printf("Starting gRPC server on %s", port)
	go func() {
		if err := s.Serve(lis); err != nil {
			log.Fatalf("failed to serve: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down gRPC server...")
	s.GracefulStop()
	log.Println("Server stopped")
}
