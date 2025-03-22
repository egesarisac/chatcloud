<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center text-white bg-gray-600 p-3 shadow-sm">
      <h2 class="text-xl font-bold mr-4"># {{ roomId }}</h2>
      <div class="flex items-center gap-2 grow" v-if="activeUsers.length > 0">
        <span class="flex items-center gap-1 text-sm"><span class="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span> {{ activeUsers.length }} active</span>
      </div>
      <button @click="leaveRoom" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">Leave Room</button>
    </div>
    
    <div class="flex-1 overflow-y-auto bg-white">
      <div class="flex flex-col p-4 space-y-1" ref="messagesContainer">
        <div v-if="loading" class="flex flex-col items-center justify-center p-4 text-gray-500">
          <div class="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <div>Loading messages...</div>
        </div>
        <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center p-8 text-gray-500 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="text-lg font-medium">No messages yet in <span class="font-bold text-primary"># {{ roomId }}</span></div>
          <div class="text-sm text-gray-400 mt-2">Be the first to send a message!</div>
        </div>
        
        <!-- Group messages by user and time -->
        <template v-for="(message, index) in messages" :key="message.id || index">
          <!-- Show user info if first message or different user from previous -->
          <div 
            class="flex items-start py-1 "
            :class="{ 'mt-2': index === 0 || messages[index-1].userId !== message.userId || isNewTimeGroup(message, messages[index-1]) }"
          >
            <!-- User avatar and info shown only for first message in a group -->
            <div v-if="index === 0 || messages[index-1].userId !== message.userId || isNewTimeGroup(message, messages[index-1])" class="flex-shrink-0">
            </div>
            <div class="flex-1 min-w-0">
              <!-- Username and timestamp shown only for first message in a group -->
              <div v-if="index === 0 || messages[index-1].userId !== message.userId || isNewTimeGroup(message, messages[index-1])" class="flex items-center gap-2 mb-1">
                <span class="font-bold text-sm text-blue-500">{{ message.userId === userId ? 'You' : message.userId }}</span>
                <span class="text-xs text-gray-400">{{ formatTimestamp(message.timestamp) }}</span>
              </div>
              <div class="text-gray-800 break-words">{{ message.content }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>
    
    <div class="flex p-3 bg-gray-100 border-t border-gray-200">
      <div class="flex w-full mx-auto relative shadow-sm rounded-lg">
        <input 
          v-model="newMessage" 
          @keyup.enter="sendMessage" 
          :placeholder="`Message #${roomId}`"
          type="text"
          class="flex-1 h-10 px-3 border border-gray-200 rounded-l-lg text-sm transition-all outline-none bg-white focus:border-primary-light focus:ring-1 focus:ring-primary-light/10"
        />
        <button 
          @click="sendMessage" 
          :disabled="!newMessage.trim() || sending"
          class="bg-gradient-to-r from-primary to-primary-light text-white border-none w-10 h-10 rounded-r-lg cursor-pointer flex items-center justify-center transition-all hover:from-primary-dark hover:to-primary hover:-translate-y-px disabled:bg-gray-300 disabled:cursor-not-allowed"
          :class="{ 'sending': sending }"
          title="Send message"
        >
          <svg v-if="!sending" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <div v-else class="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import chatCloudService from '../chatCloudService';

export default {
  name: 'ChatRoom',
  props: {
    roomId: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    activeUsers: {
      type: Array,
      default: () => []
    }
  },
  emits: ['leave-room', 'message-sent'],
  setup(props, { emit }) {
    const messages = ref([]);
    const newMessage = ref('');
    const messagesContainer = ref(null);
    const loading = ref(true);
    const sending = ref(false);
    let messageStream = null;
    
    const joinRoom = async () => {
      try {
        loading.value = true;
        const response = await chatCloudService.joinRoom(props.userId, props.roomId);
        
        if (response.success) {
          messages.value = response.recentMessages || [];
          console.log(`Joined room ${props.roomId} successfully`);
          
          startMessageStream();
        } else {
          console.error('Failed to join room');
        }
      } catch (error) {
        console.error('Error joining room:', error);
      } finally {
        loading.value = false;
      }
    };
    
    const startMessageStream = () => {
      setTimeout(() => {
        messageStream = chatCloudService.streamMessages(
          props.userId,
          props.roomId,
          (message) => {
            if (!messages.value.some(m => m.id === message.id)) {
              messages.value.push(message);
            }
          }
        );
      }, 500);
    };
    
    const sendMessage = async () => {
      if (!newMessage.value.trim() || sending.value) return;
      
      try {
        sending.value = true;
        const content = newMessage.value;
        
        const response = await chatCloudService.sendMessage(
          props.userId,
          props.roomId,
          content
        );
        
        if (response.success) {
          const messageObj = {
            id: response.messageId,
            userId: props.userId,
            roomId: props.roomId,
            content: content,
            timestamp: new Date().toISOString()
          };
          
          emit('message-sent', messageObj);
          
          newMessage.value = '';
          console.log(`Message sent with ID: ${response.messageId}`);
        } else {
          console.error('Failed to send message');
        }
      } catch (error) {
        console.error('Error sending message:', error);
      } finally {
        sending.value = false;
      }
    };
    
    const leaveRoom = async () => {
      try {
        if (messageStream) {
          messageStream.cancel();
          messageStream = null;
        }
        
        const response = await chatCloudService.leaveRoom(props.userId, props.roomId);
        
        if (response.success) {
          console.log(`Left room ${props.roomId} successfully`);
          emit('leave-room', props.roomId);
        } else {
          console.error('Failed to leave room');
        }
      } catch (error) {
        console.error('Error leaving room:', error);
        emit('leave-room', props.roomId);
      }
    };
    
    watch(messages, () => {
      scrollToBottom();
    }, { deep: true });
    
    const scrollToBottom = () => {
      if (messagesContainer.value) {
        setTimeout(() => {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }, 0);
      }
    };
    
    const formatUserId = (userId) => {
      if (!userId) return 'Unknown';
      if (userId === 'system') return 'System';
      
      if (userId === props.userId) {
        return 'You';
      } else {
        return `User-${userId.substring(0, 6)}`;
      }
    };
    
    const getInitials = (userId) => {
      if (!userId) return '?';
      if (userId === 'system') return 'S';
      if (userId === props.userId) return 'Y';
      return userId.substring(0, 1).toUpperCase();
    };
    
    const getUserColor = (userId) => {
      if (!userId) return '#6c757d';
      if (userId === 'system') return '#4cc9f0';
      
      const colors = [
        '#7289da', 
        '#43b581', 
        '#f04747', 
        '#faa61a', 
        '#2d3136', 
        '#b9bbbe', 
        '#4361ee', 
        '#4895ef', 
        '#3f37c9', 
        '#f72585', 
      ];
      
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      const index = Math.abs(hash) % colors.length;
      return colors[index];
    };
    
    const isNewTimeGroup = (currentMsg, prevMsg) => {
      if (!prevMsg || !currentMsg) return true;
      
      const prevTime = new Date(Number(prevMsg.timestamp));
      const currentTime = new Date(Number(currentMsg.timestamp));
      
      return (currentTime - prevTime) > 5 * 60 * 1000;
    };
    
    const formatTimestamp = (timestamp) => {
      if (!timestamp) return '';
      
      try {
        let date;
        if (timestamp === null || timestamp === undefined) {
          date = new Date();
        } else if (typeof timestamp === 'string') {
          date = new Date(timestamp);
        } else if (typeof timestamp === 'number') {
          date = new Date(timestamp);
        } else {
          date = new Date();
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffDay > 0) {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffHour > 0) {
          return `${diffHour}h ago`;
        } else if (diffMin > 0) {
          return `${diffMin}m ago`;
        } else if (diffSec > 10) {
          return `${diffSec}s ago`;
        } else {
          return 'just now';
        }
      } catch (error) {
        console.error('Error formatting timestamp:', error);
        return '';
      }
    };
    
    let timestampUpdateInterval = null;
    
    onMounted(() => {
      timestampUpdateInterval = setInterval(() => {
        if (messages.value.length > 0) {
          messages.value = [...messages.value];
        }
      }, 60000);
    });
    
    onUnmounted(() => {
      if (timestampUpdateInterval) {
        clearInterval(timestampUpdateInterval);
      }
    });
    
    onMounted(() => {
      joinRoom();
    });
    
    onUnmounted(() => {
      if (messageStream) {
        messageStream.cancel();
        messageStream = null;
      }
    });
    
    return {
      messages,
      newMessage,
      messagesContainer,
      loading,
      sending,
      sendMessage,
      leaveRoom,
      formatUserId,
      formatTimestamp,
      getInitials,
      getUserColor,
      isNewTimeGroup
    };
  }
};
</script>

<style scoped>
/* Animation keyframes - kept because they're used by Tailwind's animate-spin */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Pulse animation for active users indicator */
@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(6, 214, 160, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(6, 214, 160, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(6, 214, 160, 0);
  }
}

/* Custom scrollbar styles */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: #e9ecef;
  border-radius: 9999px;
}

.messages-container::-webkit-scrollbar-thumb {
  background-color: #4895ef;
  border-radius: 9999px;
}

/* All other styles have been converted to Tailwind utility classes */
</style>
