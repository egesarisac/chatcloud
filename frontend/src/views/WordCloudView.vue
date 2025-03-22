<template>
  <div class="w-full h-full flex flex-col">
    <div class="w-full flex-1 flex flex-col items-center relative p-6 bg-gradient-to-b from-white to-gray-50">
      <!-- Title and Description -->
      <div class="w-full max-w-4xl text-center mb-8 mt-4">
        <h1 class="text-3xl font-bold bg-gradient-to-r from-primary-dark to-primary-light bg-clip-text text-transparent mb-2">ChatCloud</h1>
        <p class="text-gray-600 max-w-2xl mx-auto font-bold">Explore trending topics in real-time. 
          <br>Click on any word to join a discussion room or add your own topics to the cloud.</p>
      </div>
      <!-- Icons in top-right corner -->
      <div class="absolute top-4 right-4 flex space-x-4">
        <button 
          @click="toggleAddTopicForm" 
          class="p-2 rounded-full bg-white shadow-md text-primary hover:text-primary-dark transition-colors flex items-center justify-center"
          title="Add Topic">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button 
          @click="toggleJoinedRooms" 
          class="p-2 rounded-full bg-white shadow-md text-primary hover:text-primary-dark transition-colors flex items-center justify-center"
          title="Your Rooms">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
      </div>

      <!-- Add Topic Modal -->
      <div v-if="showAddTopicForm" 
           class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm"
           @click.self="toggleAddTopicForm">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative border border-gray-200">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold bg-gradient-to-r from-primary-dark to-primary-light bg-clip-text text-transparent">Add New Topic</h2>
            <button class="text-gray-400 hover:text-gray-600 transition-colors" 
                    @click="toggleAddTopicForm">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="w-full">
            <div class="w-full relative">
              <div class="flex w-full">
                <input 
                  v-model="newTopic" 
                  placeholder="Add a new topic..." 
                  @keyup.enter="onAddNewTopic"
                  @input="updateSuggestions"
                  @keydown.down.prevent="navigateSuggestion(1)"
                  @keydown.up.prevent="navigateSuggestion(-1)"
                  @keydown.esc="clearSuggestions"
                  @focus="updateSuggestions"
                  @blur="handleBlur"
                  maxlength="30"
                  ref="topicInput"
                  class="flex-1 p-3 border border-gray-300 rounded-l-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent"
                />
                <button 
                  @click="onAddNewTopic" 
                  :disabled="!newTopic.trim()"
                  class="bg-gradient-to-r from-primary to-primary-light text-white p-3 rounded-r-lg font-semibold transition-all disabled:bg-gray-400 disabled:cursor-not-allowed hover:opacity-90"
                >Add</button>
              </div>
              
              <div v-if="suggestions.length > 0" 
                   class="w-full max-h-52 overflow-y-auto bg-white border border-gray-300 rounded-b-lg shadow-lg -mt-0.5 divide-y divide-gray-100">
                <div 
                  v-for="(suggestion, index) in suggestions" 
                  :key="suggestion.text + '-' + index"
                  class="p-3 cursor-pointer flex justify-between items-center hover:bg-primary-light/10 transition-colors"
                  :class="{ 'bg-primary-light/10': index === activeSuggestionIndex }"
                  @mousedown.prevent="selectSuggestion(suggestion)"
                  @mouseover="activeSuggestionIndex = index"
                >
                  <span class="font-medium text-gray-800">{{ suggestion.text }}</span>
                  <span class="text-sm px-2 py-1 rounded-full bg-gray-100 text-gray-700">{{ suggestion.size }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Your Rooms Modal -->
      <div v-if="showJoinedRooms" 
           class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm"
           @click.self="toggleJoinedRooms">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative max-h-[80vh] overflow-y-auto border border-gray-200">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold bg-gradient-to-r from-primary-dark to-primary-light bg-clip-text text-transparent">Your Rooms</h2>
            <button class="text-gray-400 hover:text-gray-600 transition-colors" 
                    @click="toggleJoinedRooms">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="w-full">
            
            <div v-if="joinedRooms.length === 0" 
                 class="text-gray-600 italic p-4 bg-gray-50 rounded-lg border border-gray-100 text-center text-sm leading-relaxed">
              No rooms joined yet. Click on a topic in the word cloud to join a room.
            </div>
            
            <div v-else class="flex flex-col space-y-3 mt-4">
              <div 
                v-for="room in joinedRooms" 
                :key="room.id" 
                class="bg-white rounded-lg p-4 cursor-pointer transition-all border border-gray-200 hover:shadow-md hover:border-primary-light"
                :class="{ 'border-l-4 border-l-primary': isRecentRoom(room) }"
                @click="onRoomClick(room.id)"
              >
                <div class="font-semibold text-lg text-gray-800 mb-2 capitalize">{{ room.name }}</div>
                <div class="flex justify-between items-center text-sm text-gray-600">
                  <span class="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{{ formatDate(room.joinedAt) }}</span>
                  </span>
                  <div class="flex items-center gap-2">
                    <span v-if="messageStreams[room.id]" class="text-success">●</span>
                    <span v-if="activeUsers[room.id]" 
                          class="bg-primary-light/10 text-primary-dark px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {{ activeUsers[room.id].length }} active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WordCloud :words="words" @word-clicked="onWordClick" />
      
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import WordCloud from '../components/WordCloud.vue';

const router = useRouter();
const words = inject('words');
const joinedRooms = inject('joinedRooms');
const messageStreams = inject('messageStreams');
const activeUsers = inject('activeUsers');
const handleWordClick = inject('handleWordClick');
const switchToRoom = inject('switchToRoom');
const formatDate = inject('formatDate');
const isRecentRoom = inject('isRecentRoom');
const addNewTopic = inject('addNewTopic');
const userId = inject('userId');
const newTopic = ref('');
const suggestions = ref([]);
const activeSuggestionIndex = ref(-1);
const topicInput = ref(null);

const showAddTopicForm = ref(false);
const showJoinedRooms = ref(false);
const toggleAddTopicForm = () => {
  showAddTopicForm.value = !showAddTopicForm.value;
};
const toggleJoinedRooms = () => {
  showJoinedRooms.value = !showJoinedRooms.value;
};

const updateSuggestions = () => {
  suggestions.value = [];
  setTimeout(() => {
    if (!newTopic.value.trim()) {
      const topWords = [...words.value]
        .sort((a, b) => b.size - a.size)
        .slice(0, 1);
      console.log('Showing top topic:', topWords);
      suggestions.value = topWords;
      return;
    }
    
    const input = newTopic.value.trim().toLowerCase();
    const filteredSuggestions = words.value
      .filter(word => word.text.toLowerCase().includes(input))
      .sort((a, b) => b.size - a.size)
      .slice(0, 1);
    
    console.log('Suggestions updated:', filteredSuggestions);
    suggestions.value = filteredSuggestions;
    activeSuggestionIndex.value = -1;
  }, 0);
};

const navigateSuggestion = (direction) => {
  if (suggestions.value.length === 0) return;
  
  const newIndex = activeSuggestionIndex.value + direction;
  if (newIndex >= -1 && newIndex < suggestions.value.length) {
    activeSuggestionIndex.value = newIndex;
  }
  
  if (activeSuggestionIndex.value !== -1) {
    newTopic.value = suggestions.value[activeSuggestionIndex.value].text;
  }
};

const selectSuggestion = (suggestion) => {
  newTopic.value = suggestion.text;
  clearSuggestions();
  if (topicInput.value) {
    topicInput.value.focus();
  }
};

const clearSuggestions = () => {
  suggestions.value = [];
  activeSuggestionIndex.value = -1;
};

const handleBlur = () => {
  setTimeout(() => {
    clearSuggestions();
  }, 300);
};

const onAddNewTopic = () => {
  if (newTopic.value.trim()) {
    addNewTopic(newTopic.value.trim());
    newTopic.value = '';
    clearSuggestions();
    showAddTopicForm.value = false;
    showJoinedRooms.value = true;
  }
};

const onWordClick = (word) => {
  handleWordClick(word);
};

const onRoomClick = (roomId) => {
  switchToRoom(roomId);
};
</script>
