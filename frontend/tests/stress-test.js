// ChatCloud Stress Testing Tool
// Simulates multiple users joining rooms and sending messages

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080/api/ws',
  numUsers: 100,
  messagesPerUser: 10,
  messageInterval: 500, // ms between messages
  roomId: 'stress-test-room',
  logInterval: 5000, // ms between status logs
};

// Metrics
const metrics = {
  usersCreated: 0,
  usersConnected: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0,
  startTime: 0,
  endTime: 0,
  responseTimeTotal: 0,
  responseTimeCount: 0,
};

// User simulation
class User {
  constructor(id) {
    this.id = id || uuidv4();
    this.username = `test-user-${this.id.substring(0, 6)}`;
    this.messageCount = 0;
    this.connected = false;
    this.socket = null;
    this.messageQueue = [];
    this.lastSentTime = 0;
  }

  async connect() {
    try {
      console.log(`User ${this.username} connecting...`);
      
      // Join room via HTTP request
      const joinResponse = await fetch(`${CONFIG.baseUrl}/api/rooms/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.id,
          roomId: CONFIG.roomId,
        }),
      });

      if (!joinResponse.ok) {
        throw new Error(`Failed to join room: ${joinResponse.statusText}`);
      }

      // Connect to WebSocket for streaming messages
      this.socket = new WebSocket(`${CONFIG.wsUrl}?userId=${this.id}&roomId=${CONFIG.roomId}`);
      
      this.socket.on('open', () => {
        console.log(`User ${this.username} connected to WebSocket`);
        this.connected = true;
        metrics.usersConnected++;
        
        // Start sending messages
        this.scheduleNextMessage();
      });
      
      this.socket.on('message', (data) => {
        metrics.messagesReceived++;
        const message = JSON.parse(data);
        
        // Calculate response time if this is our own message
        if (message.userId === this.id) {
          const now = performance.now();
          const sendTime = this.messageQueue.find(m => m.content === message.content)?.time;
          
          if (sendTime) {
            const responseTime = now - sendTime;
            metrics.responseTimeTotal += responseTime;
            metrics.responseTimeCount++;
          }
        }
      });
      
      this.socket.on('error', (error) => {
        console.error(`WebSocket error for user ${this.username}:`, error);
        metrics.errors++;
      });
      
      this.socket.on('close', () => {
        console.log(`User ${this.username} disconnected`);
        this.connected = false;
      });
      
    } catch (error) {
      console.error(`Error connecting user ${this.username}:`, error);
      metrics.errors++;
    }
  }
  
  async sendMessage() {
    if (!this.connected || this.messageCount >= CONFIG.messagesPerUser) {
      return;
    }
    
    try {
      const content = `Test message from ${this.username} #${this.messageCount + 1} at ${new Date().toISOString()}`;
      
      const sendTime = performance.now();
      this.messageQueue.push({ content, time: sendTime });
      
      // Send message via HTTP request
      const sendResponse = await fetch(`${CONFIG.baseUrl}/api/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.id,
          roomId: CONFIG.roomId,
          content,
        }),
      });

      if (!sendResponse.ok) {
        throw new Error(`Failed to send message: ${sendResponse.statusText}`);
      }
      
      this.messageCount++;
      metrics.messagesSent++;
      this.lastSentTime = Date.now();
      
      // Schedule next message if we haven't reached the limit
      this.scheduleNextMessage();
      
    } catch (error) {
      console.error(`Error sending message for user ${this.username}:`, error);
      metrics.errors++;
      
      // Retry after a delay
      setTimeout(() => this.scheduleNextMessage(), 1000);
    }
  }
  
  scheduleNextMessage() {
    if (this.messageCount < CONFIG.messagesPerUser) {
      setTimeout(() => this.sendMessage(), CONFIG.messageInterval);
    } else {
      // Disconnect when done
      this.disconnect();
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.connected = false;
    }
  }
}

// Main test function
async function runStressTest() {
  console.log(`Starting stress test with ${CONFIG.numUsers} users...`);
  console.log(`Each user will send ${CONFIG.messagesPerUser} messages to room ${CONFIG.roomId}`);
  
  metrics.startTime = performance.now();
  
  // Create users
  const users = [];
  for (let i = 0; i < CONFIG.numUsers; i++) {
    const user = new User();
    users.push(user);
    metrics.usersCreated++;
    
    // Stagger connections to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
    user.connect();
  }
  
  // Log status periodically
  const statusInterval = setInterval(() => {
    const elapsedSeconds = ((performance.now() - metrics.startTime) / 1000).toFixed(1);
    const avgResponseTime = metrics.responseTimeCount > 0 
      ? (metrics.responseTimeTotal / metrics.responseTimeCount).toFixed(2) 
      : 'N/A';
    
    console.log(`
Status after ${elapsedSeconds}s:
  Users connected: ${metrics.usersConnected}/${CONFIG.numUsers}
  Messages sent: ${metrics.messagesSent}/${CONFIG.numUsers * CONFIG.messagesPerUser}
  Messages received: ${metrics.messagesReceived}
  Errors: ${metrics.errors}
  Avg response time: ${avgResponseTime}ms
    `);
    
    // Check if test is complete
    if (metrics.messagesSent >= CONFIG.numUsers * CONFIG.messagesPerUser) {
      clearInterval(statusInterval);
      finishTest();
    }
  }, CONFIG.logInterval);
  
  // Set a maximum test duration
  setTimeout(() => {
    clearInterval(statusInterval);
    finishTest();
  }, 5 * 60 * 1000); // 5 minutes max
}

function finishTest() {
  metrics.endTime = performance.now();
  const testDurationSec = (metrics.endTime - metrics.startTime) / 1000;
  const messagesPerSec = metrics.messagesSent / testDurationSec;
  const avgResponseTime = metrics.responseTimeCount > 0 
    ? metrics.responseTimeTotal / metrics.responseTimeCount 
    : 'N/A';
  
  console.log(`
Stress Test Completed
=====================
Duration: ${testDurationSec.toFixed(2)} seconds
Users: ${metrics.usersConnected}/${CONFIG.numUsers}
Messages sent: ${metrics.messagesSent}/${CONFIG.numUsers * CONFIG.messagesPerUser}
Messages received: ${metrics.messagesReceived}
Messages per second: ${messagesPerSec.toFixed(2)}
Average response time: ${typeof avgResponseTime === 'number' ? avgResponseTime.toFixed(2) + 'ms' : avgResponseTime}
Errors: ${metrics.errors}
  `);
  
  process.exit(0);
}

// Run the test
runStressTest().catch(error => {
  console.error('Fatal error in stress test:', error);
  process.exit(1);
});
