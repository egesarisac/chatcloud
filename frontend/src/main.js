import { createApp } from 'vue';
import App from './App.vue';
import './assets/main.css';
import { createRouter, createWebHistory } from 'vue-router';

// Import views
import WordCloudView from './views/WordCloudView.vue';
import ChatRoomView from './views/ChatRoomView.vue';

// Create router instance
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: WordCloudView
    },
    {
      path: '/room/:roomId',
      name: 'chatroom',
      component: ChatRoomView,
      props: true
    }
  ]
});

// Create and mount app
const app = createApp(App);
app.use(router);
app.mount('#app');
