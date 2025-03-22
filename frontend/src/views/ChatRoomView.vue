<template>
  <div class="flex h-full w-full bg-gray-100">
    <!-- Main chat area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <ChatRoom 
        :room-id="roomId" 
        :user-id="userId"
        :active-users="activeUsers[roomId] || []"
        @leave-room="onLeaveRoom"
        @message-sent="onMessageSent"
        class="flex-1 flex flex-col overflow-hidden"
      />
    </div>
  </div>
</template>

<script setup>
import { inject, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ChatRoom from '../components/ChatRoom.vue';

const router = useRouter();
const route = useRoute();
const roomId = route.params.roomId;

const userId = inject('userId');
const activeUsers = inject('activeUsers');
const handleLeaveRoom = inject('handleLeaveRoom');
const handleNewMessage = inject('handleNewMessage');

const navigateToHome = () => {
  router.push('/');
};

const onLeaveRoom = () => {
  handleLeaveRoom(roomId);
};

const onMessageSent = (message) => {
  handleNewMessage(roomId, message);
};

onMounted(() => {
  const joinedRooms = inject('joinedRooms');
  const roomExists = joinedRooms.value.some(room => room.id === roomId);
  
  if (!roomExists) {
    const handleWordClick = inject('handleWordClick');
    handleWordClick({ text: roomId });
  }
  
  // Close sidebar on mobile when entering a chat room
  const isMobileSidebarOpen = inject('isMobileSidebarOpen');
  if (isMobileSidebarOpen && window.innerWidth < 768) {
    isMobileSidebarOpen.value = false;
  }
  
  document.title = `#${roomId} | ChatCloud`;
});
</script>
