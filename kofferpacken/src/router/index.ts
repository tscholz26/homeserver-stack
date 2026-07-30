import { createRouter, createWebHistory } from 'vue-router'
import PackView from '@/views/PackView.vue'
import VerwaltungView from '@/views/VerwaltungView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: PackView },
    { path: '/verwaltung', component: VerwaltungView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
