FROM golang:1.24-alpine

WORKDIR /app

# Copy go.mod and go.sum files first for better layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the application
RUN go build -o main .

# Expose the gRPC port
EXPOSE 50051

# Run the application
CMD ["./main"]
