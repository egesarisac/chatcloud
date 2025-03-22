<script setup>
import { ref, onMounted, watch, onUnmounted, provide } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'vue-router';
import chatCloudService from './chatCloudService';
import userPresenceService from './userPresenceService';
import PerformanceMonitor from './components/PerformanceMonitor.vue';

const router = useRouter();

const userId = ref('');
const joinedRooms = ref([]);
const newTopic = ref('');
const activeRoom = ref(null);
const isMobileSidebarOpen = ref(false);
const debugMode = ref(false);

// Check URL parameters for debug mode
const checkDebugMode = () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('debug') || localStorage.getItem('chatcloud_debug_mode') === 'true') {
    debugMode.value = true;
    localStorage.setItem('chatcloud_debug_mode', 'true');
  }
};

// Toggle debug mode
const toggleDebugMode = () => {
  debugMode.value = !debugMode.value;
  localStorage.setItem('chatcloud_debug_mode', debugMode.value ? 'true' : 'false');
};

const navigateToHome = () => {
  router.push('/');
};

const toggleMobileSidebar = () => {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value;
};

const words = ref([]);
const messageStreams = ref({});
const activeUsers = ref({});

const updateWordCloud = () => {
  words.value.forEach(word => {
    const roomId = word.roomId || word.text.toLowerCase().replace(/\s+/g, '-');
    const usersInRoom = activeUsers.value[roomId] || [];
    
    // Adjust size based on number of active users
    if (usersInRoom.length > 0) {
      // Base size (25) + bonus for each active user (up to 100 max)
      word.size = Math.min(100, 25 + (usersInRoom.length * 5));
    } else {
      // Gradually decrease size for inactive topics (but not below 15)
      word.size = Math.max(15, word.size * 0.95);
    }
  });
  
  localStorage.setItem('chatcloud_topics', JSON.stringify(words.value));
};

const handleNewMessage = (message) => {
  if (message && message.content) {
    if (message.userId) {
      userPresenceService.updateUserPresence(message.roomId, message.userId);
      
      updateActiveUsers(message.roomId);
      
      updateWordCloud();
    }
  }
};

const updateActiveUsers = (roomId) => {
  if (!roomId) return;
  
  const users = userPresenceService.getActiveUsers(roomId);
  
  activeUsers.value = {
    ...activeUsers.value,
    [roomId]: users
  };
  
  if (words.value.length > 0) {
    updateWordCloud();
  }
};

let wordCloudUpdateInterval = null;

onMounted(() => {
  // Check for debug mode
  checkDebugMode();
  
  // Handle test word count parameter for performance testing
  const urlParams = new URLSearchParams(window.location.search);
  const testWordCount = urlParams.get('testWordCount');
  
  const savedTopics = localStorage.getItem('chatcloud_topics');
  if (savedTopics) {
    try {
      words.value = JSON.parse(savedTopics);
      console.log('Loaded saved topics from localStorage:', words.value);
      
      // If test word count is specified, generate that many words for testing
      if (testWordCount && !isNaN(parseInt(testWordCount))) {
        const count = parseInt(testWordCount);
        console.log(`Test mode: Generating ${count} words for performance testing`);
        generateTestWords(count);
      }
    } catch (e) {
      console.error('Failed to parse saved topics:', e);
    }
  }
  
  const storedUserId = localStorage.getItem('chatcloud_user_id');
  if (storedUserId) {
    userId.value = storedUserId;
  } else {
    userId.value = uuidv4();
    localStorage.setItem('chatcloud_user_id', userId.value);
  }
  
  userPresenceService.initialize(userId.value);
  
  chatCloudService.joinRoom(userId.value, 'global-topics')
    .then(response => {
      console.log('Joined global-topics room:', response);
    })
    .catch(error => {
      console.error('Failed to join global-topics room:', error);
    });
    
  const topicStream = chatCloudService.streamTopicUpdates(userId.value, (topic) => {
    console.log('Received topic update:', topic);
    
    const existingTopicIndex = words.value.findIndex(word => 
      word.text.toLowerCase() === topic.text.toLowerCase()
    );
    
    if (existingTopicIndex >= 0) {
      words.value[existingTopicIndex].size = topic.size;
    } else {
      words.value.push({
        text: topic.text,
        size: topic.size,
        roomId: topic.roomId,
        sharedBy: topic.createdBy,
        isNew: true
      });
      
      setTimeout(() => {
        const newTopic = words.value.find(w => w.text === topic.text);
        if (newTopic) {
          newTopic.isNew = false;
        }
      }, 5000);
    }
    
    localStorage.setItem('chatcloud_topics', JSON.stringify(words.value));
    
    updateWordCloud();
  });
  
  const userRefreshInterval = setInterval(() => {
    if (activeRoom.value) {
      updateActiveUsers(activeRoom.value);
    }
  }, 30000);
  
  wordCloudUpdateInterval = setInterval(() => {
    if (words.value.length > 0 && !activeRoom.value) {
      updateWordCloud();
    }
  }, 30000);
  
  onUnmounted(() => {
    clearInterval(userRefreshInterval);
    clearInterval(wordCloudUpdateInterval);
    userPresenceService.cleanup();
    
    if (topicStream && typeof topicStream.cancel === 'function') {
      topicStream.cancel();
    }
    
    Object.values(messageStreams.value).forEach(stream => {
      if (stream && typeof stream.cancel === 'function') {
        stream.cancel();
      }
    });
  });
  
  const storedRooms = localStorage.getItem('chatcloud_joined_rooms');
  if (storedRooms) {
    try {
      joinedRooms.value = JSON.parse(storedRooms);
      
      joinedRooms.value = joinedRooms.value.map(room => ({
        id: room.id,
        name: room.name || room.id,
        joinedAt: room.joinedAt || new Date().toISOString(),
        lastVisited: room.lastVisited || new Date().toISOString(),
        messageCount: room.messageCount || 0
      }));
      
      joinedRooms.value.sort((a, b) => 
        new Date(b.lastVisited) - new Date(a.lastVisited)
      );
      
      setupMessageStream('global-topics');
    } catch (error) {
      console.error('Error parsing joined rooms:', error);
      joinedRooms.value = [];
    }
  }
  
  const storedActiveRoom = localStorage.getItem('chatcloud_active_room');
  if (storedActiveRoom) {
    const roomExists = joinedRooms.value.some(room => room.id === storedActiveRoom);
    if (roomExists) {
      activeRoom.value = storedActiveRoom;
    }
  }
});

const setupMessageStream = (roomId) => {
  if (messageStreams.value[roomId]) return;
  
  updateActiveUsers(roomId);
  
  userPresenceService.joinRoom(roomId);
  
  setTimeout(() => {
    messageStreams.value[roomId] = chatCloudService.streamMessages(
      userId.value,
      roomId,
      (message) => {
        handleNewMessage(message);
      }
    );
  }, 500);
};

watch(joinedRooms, (newRooms, oldRooms) => {
  if (oldRooms) {
    const oldRoomIds = new Set(oldRooms.map(r => r.id));
    newRooms.forEach(room => {
      if (!oldRoomIds.has(room.id)) {
        setupMessageStream(room.id);
      }
    });
  }
}, { deep: true });

const handleWordClick = (wordObj) => {
  const roomId = wordObj.roomId || wordObj.text.toLowerCase().replace(/\s+/g, '-');
  const wordText = wordObj.text;
  
  const existingRoom = joinedRooms.value.find(room => room.id === roomId);
  
  if (existingRoom) {
    existingRoom.lastVisited = new Date().toISOString();
    
    activeRoom.value = roomId;
  } else {
    joinedRooms.value.push({
      id: roomId,
      name: wordText,
      joinedAt: new Date().toISOString(),
      lastVisited: new Date().toISOString(),
      messageCount: 0
    });
    
    userPresenceService.joinRoom(roomId, userId.value);
  }
  
  localStorage.setItem('chatcloud_joined_rooms', JSON.stringify(joinedRooms.value));
  
  activeRoom.value = roomId;
  
  localStorage.setItem('chatcloud_active_room', roomId);
  
  setupMessageStream(roomId);
  
  router.push(`/room/${roomId}`);
};

const handleLeaveRoom = (roomId) => {
  joinedRooms.value = joinedRooms.value.filter(room => room.id !== roomId);
  
  localStorage.setItem('chatcloud_joined_rooms', JSON.stringify(joinedRooms.value));
  
  if (messageStreams.value[roomId]) {
    messageStreams.value[roomId].cancel();
    delete messageStreams.value[roomId];
  }
  
  userPresenceService.leaveRoom(roomId);
  
  if (activeRoom.value === roomId) {
    activeRoom.value = null;
    
    localStorage.removeItem('chatcloud_active_room');
    
    router.push('/');
  }
  
  Object.keys(messageStreams.value).forEach(streamRoomId => {
    if (streamRoomId !== 'global-topics') {
      if (messageStreams.value[streamRoomId]) {
        messageStreams.value[streamRoomId].cancel();
        delete messageStreams.value[streamRoomId];
      }
    }
  });
};

const isRecentRoom = (room) => {
  if (!room.lastVisited) return false;
  
  const lastVisited = new Date(room.lastVisited);
  const now = new Date();
  const hoursDiff = (now - lastVisited) / (1000 * 60 * 60);
  
  return hoursDiff < 24;
};

const switchToRoom = (roomId) => {
  const room = joinedRooms.value.find(r => r.id === roomId);
  if (room) {
    room.lastVisited = new Date().toISOString();
    localStorage.setItem('chatcloud_joined_rooms', JSON.stringify(joinedRooms.value));
  }
  
  activeRoom.value = roomId;
  localStorage.setItem('chatcloud_active_room', roomId);
  
  setupMessageStream(roomId);
  
  router.push(`/room/${roomId}`);
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffDay > 30) {
    return date.toLocaleDateString();
  } else if (diffDay > 0) {
    return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  } else if (diffHour > 0) {
    return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  } else if (diffMin > 0) {
    return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};

const addNewTopic = async (topic) => {
  const topicText = topic || newTopic.value.trim();
  if (!topicText) return;
  
  const topicExists = words.value.some(word => 
    word.text.toLowerCase() === topicText.toLowerCase()
  );
  
  let topicToShare;
  let roomId;
  
  if (topicExists) {
    const existingWord = words.value.find(word => 
      word.text.toLowerCase() === topicText.toLowerCase()
    );
    existingWord.size = Math.min(100, existingWord.size + 5); // Cap at 100
    topicToShare = existingWord;
    roomId = existingWord.roomId || existingWord.text.toLowerCase().replace(/\s+/g, '-');
  } else {
    roomId = topicText.toLowerCase().replace(/\s+/g, '-');
    const newTopicObj = {
      text: topicText,
      size: 25,
      roomId: roomId
    };
    
    words.value.push(newTopicObj);
    topicToShare = newTopicObj;
  }
  
  localStorage.setItem('chatcloud_topics', JSON.stringify(words.value));
  
  try {
    await chatCloudService.shareTopic(userId.value, topicToShare);
    console.log(`Shared topic "${topicToShare.text}" with other users`);
  } catch (error) {
    console.error('Failed to share topic:', error);
  }
  
  const existingRoom = joinedRooms.value.find(room => room.id === roomId);
  
  if (!existingRoom) {
    joinedRooms.value.push({
      id: roomId,
      name: topicText,
      joinedAt: new Date().toISOString(),
      lastVisited: new Date().toISOString(),
      messageCount: 0
    });
    
    userPresenceService.joinRoom(roomId, userId.value);
    
    localStorage.setItem('chatcloud_joined_rooms', JSON.stringify(joinedRooms.value));
    
    setupMessageStream(roomId);
  }
  
  newTopic.value = '';
  
  return { roomId, text: topicText };
};

// Generate test words for performance testing
const generateTestWords = (count) => {
  const testWords = [];
  const baseWords = [
    'javascript', 'vue', 'react', 'angular', 'svelte', 'typescript', 'node', 'express',
    'mongodb', 'postgres', 'mysql', 'redis', 'graphql', 'rest', 'api', 'frontend',
    'backend', 'fullstack', 'developer', 'engineer', 'code', 'programming', 'software',
    'web', 'app', 'mobile', 'desktop', 'cloud', 'server', 'client', 'database', 'data',
    'algorithm', 'structure', 'pattern', 'design', 'architecture', 'system', 'network',
    'security', 'performance', 'optimization', 'testing', 'deployment', 'devops', 'agile'
  ];
  
  // Generate random words with varying sizes
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * baseWords.length);
    const randomSize = 15 + Math.floor(Math.random() * 45); // Size between 15-60
    
    testWords.push({
      text: i < baseWords.length ? baseWords[i] : `${baseWords[randomIndex]}-${i}`,
      size: randomSize,
      isNew: Math.random() > 0.8, // 20% chance of being marked as new
      roomId: 'test-room'
    });
  }
  
  words.value = testWords;
};

// Listen for word cloud test events
const setupWordCloudTestListener = () => {
  // Expose words data to window for debugging
  watch(words, (newWords) => {
    window.debugWordData = newWords;
    console.log(`DEBUG: Words data updated, ${newWords.length} words available`);
  }, { deep: true });

  window.addEventListener('wordcloud:test', () => {
    console.log('Word cloud test event received, forcing redraw...');
    // Force a redraw by slightly modifying the word sizes
    words.value = words.value.map(word => ({
      ...word,
      size: word.size + (Math.random() > 0.5 ? 0.1 : -0.1) // Tiny change to force redraw
    }));
    console.log(`Redraw triggered for ${words.value.length} words`);
  });
};

// Set up event listener for manual performance testing
const setupManualTestListener = () => {
  window.addEventListener('generate:testwords', (event) => {
    const count = event.detail?.count || 200;
    console.log(`Generating ${count} test words for performance testing...`);
    generateTestWords(count);
    console.log(`Generated ${words.value.length} test words with sizes:`, 
      words.value.slice(0, 3).map(w => w.size));
  });
  
  // Add global helper for debugging
  window.debugChatCloud = {
    getWordCount: () => words.value.length,
    forceRedraw: () => {
      words.value = [...words.value];
      return `Forced redraw of ${words.value.length} words`;
    },
    generateWords: (count = 200) => {
      generateTestWords(count);
      return `Generated ${words.value.length} test words`;
    }
  };
};

// Call setup on mount
onMounted(() => {
  setupWordCloudTestListener();
  setupManualTestListener();
});

provide('userId', userId);
provide('words', words);
provide('joinedRooms', joinedRooms);
provide('messageStreams', messageStreams);
provide('debugMode', debugMode);
provide('activeUsers', activeUsers);
provide('handleWordClick', handleWordClick);
provide('handleLeaveRoom', handleLeaveRoom);
provide('switchToRoom', switchToRoom);
provide('addNewTopic', addNewTopic);
provide('handleNewMessage', handleNewMessage);
provide('formatDate', formatDate);
provide('isRecentRoom', isRecentRoom);
provide('isMobileSidebarOpen', isMobileSidebarOpen);
provide('toggleMobileSidebar', toggleMobileSidebar);
</script>

<template>
  <div class="h-full w-full bg-gray-50 flex flex-col">
    <!-- Debug Mode Toggle -->
    <div v-if="debugMode" class="fixed top-3 right-3 z-50">
      <button @click="toggleDebugMode" class="bg-gray-800 text-white px-3 py-1 rounded-md text-sm">
        Debug Mode: ON
      </button>
    </div>
    
    <!-- Performance Monitor -->
    <div v-if="debugMode" class="fixed bottom-0 left-0 right-0 z-40">
      <PerformanceMonitor />
    </div>
    
    <!-- Main Content with Sidebar Layout -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Mobile sidebar toggle button -->
      <button 
        @click="toggleMobileSidebar" 
        class="md:hidden fixed top-3 left-3 z-20 bg-gray-800 text-white p-2 rounded-md shadow-md"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
      </button>
      
      <!-- Sidebar for Joined Rooms -->
      <aside 
        class="w-60 bg-gray-800 text-gray-200 flex flex-col overflow-hidden flex-shrink-0 transition-all duration-300 ease-in-out fixed md:static inset-y-0 left-0 z-10 transform md:transform-none"
        :class="{
          '-translate-x-full': !isMobileSidebarOpen && $route.name === 'chatroom',
          'translate-x-0': isMobileSidebarOpen || $route.name !== 'chatroom'
        }"
      >
        <div class="p-4 border-b border-gray-900">
          <h1 class="text-lg font-bold text-white bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">ChatCloud</h1>
        </div>  

        <div class="flex-1 overflow-y-auto p-3">
          <div class="mb-2" v-if="$route.name === 'chatroom'">
            <button 
              class="flex items-center gap-2 bg-transparent text-gray-200 border-none py-1.5 px-2 rounded hover:bg-gray-700 hover:text-white text-sm font-medium w-full text-left transition-colors"
              @click="navigateToHome"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Word Cloud</span>
            </button>
          </div>
        
          <div class="mt-auto pb-4">
            <div class="text-sm mb-2 text-gray-300">Add a new topic</div>
            <div class="flex">
              <input 
                v-model="newTopic" 
                type="text" 
                placeholder="Type a topic..." 
                class="flex-1 px-1 py-2 border border-gray-300 rounded-l-lg focus:outline-none text-gray-700 placeholder-gray-500 focus:border-transparent"
                @keyup.enter="addNewTopic(newTopic)"
              />
              <button 
                @click="addNewTopic(newTopic)"
                class="px-3 py-2 bg-gradient-to-r from-primary to-primary-light text-white rounded-r-lg hover:opacity-90 transition-opacity"
              >
                +
              </button>
            </div>
          </div>

          <h2 class="text-lg font-semibold mb-4 text-gray-200">Your Rooms</h2>
          
          <div class="space-y-2">
            <div 
              v-for="room in joinedRooms" 
              :key="room.id"
              @click="switchToRoom(room.id)"
              class="flex items-center p-2 rounded cursor-pointer transition-all duration-200"
              :class="{
                'bg-gray-600 text-primary-dark': activeRoom === room.id,
                'hover:bg-gray-600 bg-gray-800': activeRoom !== room.id
              }"
            >
                <div class="text-xl font-bold text-gray-400 mr-2">#</div>
                <div class="overflow-hidden">
                  <div class="font-semibold text-white text-sm truncate">{{ room.name }}</div>
                  <div class="text-xs text-gray-400 flex items-center gap-1" v-if="activeUsers[room.id]">
                    <span class="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
                    {{ activeUsers[room.id].length }} active
                  </div>
                </div>
            </div>
          </div>
        </div>

        <div class="flex items-center p-2 bg-gray-900 mt-auto">
          <div class="mr-2">
            <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
              <i class="fa fa-user"></i>
            </div>
          </div>
          <div class="flex">
            <div class="font-semibold text-white text-xs">{{ userId }}</div>
            <div class="text-green-500 text-xs"><span class="w-2 h-2 bg-green-500 rounded-full inline-block"></span></div>
          </div>
        </div>
      </aside>
      
      <!-- Overlay for mobile sidebar -->
      <div 
        v-if="isMobileSidebarOpen && $route.name === 'chatroom'" 
        @click="toggleMobileSidebar"
        class="fixed inset-0 bg-black bg-opacity-50 z-0 md:hidden transition-opacity duration-300"
      ></div>
      
      <!-- Main Content Area -->
      <main class="flex-1 overflow-hidden md:ml-0 transition-all duration-300">
        <router-view></router-view>
      </main>
    </div>
  </div>
</template>

<style>
:root {
  --primary: #4361ee;
  --primary-light: #4895ef;
  --primary-dark: #3f37c9;
  --secondary: #4cc9f0;
  --accent: #f72585;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.room-list::-webkit-scrollbar {
  width: 6px;
}

.room-list::-webkit-scrollbar-track {
  background-color: #e5e7eb; /* bg-gray-200 */
  border-radius: 9999px; /* rounded-full */
}

.room-list::-webkit-scrollbar-thumb {
  background-color: #3b82f6; /* bg-blue-500 */
  border-radius: 9999px; /* rounded-full */
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
