// User Presence Service
// Tracks and manages user presence across chat rooms

import chatCloudService from './chatCloudService';

// Store active users by room
const activeUsers = {};

// Store the current user's presence status
let currentUserId = null;
let presenceInterval = null;
const PRESENCE_INTERVAL = 30000; // 30 seconds

// Initialize the service with the current user's ID
const initialize = (userId) => {
  if (!userId) return;
  
  currentUserId = userId;
  
  // Clear any existing interval
  if (presenceInterval) {
    clearInterval(presenceInterval);
  }
  
  // Set up interval to refresh presence
  presenceInterval = setInterval(() => {
    refreshPresence();
  }, PRESENCE_INTERVAL);
  
  return true;
};

// Clean up when the service is no longer needed
const cleanup = () => {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  
  currentUserId = null;
};

// Join a room and mark user as present
const joinRoom = async (roomId) => {
  if (!currentUserId || !roomId) return false;
  
  try {
    // Call the backend to join the room
    const response = await chatCloudService.joinRoom(currentUserId, roomId);
    
    if (response.success) {
      // Add user to active users for this room
      if (!activeUsers[roomId]) {
        activeUsers[roomId] = new Map();
      }
      
      // Add or update the current user
      activeUsers[roomId].set(currentUserId, {
        id: currentUserId,
        lastSeen: new Date().toISOString()
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error joining room:', error);
    return false;
  }
};

// Leave a room and mark user as no longer present
const leaveRoom = async (roomId) => {
  if (!currentUserId || !roomId) return false;
  
  try {
    // Call the backend to leave the room
    const response = await chatCloudService.leaveRoom(currentUserId, roomId);
    
    if (response.success) {
      // Remove user from active users for this room
      if (activeUsers[roomId]) {
        activeUsers[roomId].delete(currentUserId);
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error leaving room:', error);
    return false;
  }
};

// Update user presence in all joined rooms
const refreshPresence = async () => {
  if (!currentUserId) return;
  
  // Update presence for all rooms the user is in
  for (const roomId of Object.keys(activeUsers)) {
    if (activeUsers[roomId].has(currentUserId)) {
      try {
        // In a real implementation, we would call an API to refresh presence
        // For now, just update the timestamp
        const currentUser = activeUsers[roomId].get(currentUserId);
        activeUsers[roomId].set(currentUserId, {
          id: currentUserId,
          lastSeen: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error refreshing presence for room ${roomId}:`, error);
      }
    }
  }
};

// Get active users for a room
const getActiveUsers = (roomId) => {
  if (!roomId || !activeUsers[roomId]) return [];
  
  // Filter out users who haven't been seen in the last 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  
  return Array.from(activeUsers[roomId].values())
    .filter(user => user.lastSeen > twoMinutesAgo);
};

// Add or update a user in a room (e.g., when they send a message)
const updateUserPresence = (roomId, userId) => {
  if (!roomId || !userId) return;
  
  // Initialize room if needed
  if (!activeUsers[roomId]) {
    activeUsers[roomId] = new Map();
  }
  
  // Add or update the user
  activeUsers[roomId].set(userId, {
    id: userId,
    lastSeen: new Date().toISOString()
  });
};

// Check if a user is active in a room
const isUserActive = (roomId, userId) => {
  if (!roomId || !userId || !activeUsers[roomId]) return false;
  
  const user = activeUsers[roomId].get(userId);
  if (!user) return false;
  
  // Check if the user has been seen in the last 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  return user.lastSeen > twoMinutesAgo;
};

export default {
  initialize,
  cleanup,
  joinRoom,
  leaveRoom,
  getActiveUsers,
  updateUserPresence,
  isUserActive
};
