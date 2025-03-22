# ChatCloud

<p align="center">
  <img src="chatcloud-logo.svg" alt="ChatCloud Logo" width="200"/>
  <br>
  <em>A Real-Time Word Cloud Chat Platform</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#technical-stack">Technical Stack</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

## 🚀 Project Overview

ChatCloud is an innovative web application that combines the visual appeal of word clouds with the functionality of real-time chat rooms. It creates a unique social experience where conversations are discovered through an interactive visualization of popular topics.

Users can:
1. Discover trending topics via an interactive word cloud (words sized by popularity)
2. Join or create chat rooms by clicking on words
3. Chat anonymously in real-time while retaining access to previous rooms
4. See conversations evolve as the word cloud updates in real-time

## ✨ Features

### Interactive Word Cloud
- Dynamic D3.js visualization that updates in real-time
- Words sized according to popularity
- Smooth animations and transitions
- Click on words to join topic-specific chat rooms

### Smart Topic System
- Autocomplete feature for adding new topics
- Suggestions based on existing topics to prevent duplicates
- Keyboard navigation support for suggestions
- Visual feedback showing topic popularity

### Modern UI/UX
- Comprehensive CSS design system with consistent variables
- Responsive layout with sticky header and sidebar organization
- Enhanced typography with gradient effects
- Intuitive navigation and visual feedback

### Efficient Real-time Communication
- Optimized message streams for better performance
- Global topic room for word cloud updates
- Individual chat room streams established only when needed
- Automatic cleanup of unused connections

### User System
- Anonymous user identification with UUID
- Usernames for chat participation
- Cross-session persistence via localStorage
- Retain access to previously joined rooms

## 📦 Installation

### Prerequisites

- Docker and Docker Compose

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/egesarisac/chatcloud.git
   cd chatcloud
   ```

2. **Start all services with Docker Compose**
   ```bash
   docker-compose up
   ```
   This will start all required services:
   - Redis database
   - Go backend server
   - Envoy proxy for gRPC-Web
   - Vue.js frontend

3. **Access the application**
   
   Open your browser and navigate to `http://localhost:3000`

### Development Setup

If you want to run the services individually for development:

1. **Start Redis**
   ```bash
   docker-compose up -d redis
   ```

2. **Run the Backend**
   ```bash
   cd backend
   go run main.go
   ```

3. **Run the Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 🔧 Technical Stack

### Frontend
- **Vue 3**: Progressive JavaScript framework
- **Vite**: Next-generation frontend tooling
- **D3.js**: Data visualization library for the word cloud
- **gRPC-Web**: Client for backend communication

### Backend
- **Go**: High-performance gRPC server
- **Redis**: For message storage and pub/sub functionality
- **Protocol Buffers**: For efficient data serialization

### Infrastructure
- **Docker**: Containerization
- **Envoy Proxy**: For gRPC-Web translation
- **Docker Compose**: Multi-container orchestration

## 📁 Project Structure

```
chatcloud/
├── backend/           # Go gRPC server
│   ├── Dockerfile     # Backend container configuration
│   ├── go.mod         # Go dependencies
│   ├── main.go        # Entry point
│   ├── proto/         # Generated protobuf code
│   └── server/        # Server implementation
├── frontend/          # Vue 3 frontend
│   ├── Dockerfile     # Frontend container configuration
│   ├── public/        # Static assets
│   ├── src/           # Source code
│   │   ├── components/# Vue components
│   │   ├── services/  # API clients
│   └── vite.config.js # Vite configuration
├── proto/             # Protocol Buffers definitions
├── docker-compose.yml # Multi-container configuration
└── envoy.yaml         # Envoy Proxy configuration for gRPC-Web
```

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

Distributed under the MIT License.