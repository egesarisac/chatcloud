import { createRouter, createWebHistory } from 'vue-router'
import WordCloudView from '../views/WordCloudView.vue'
import ChatRoomView from '../views/ChatRoomView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
})

export default router
