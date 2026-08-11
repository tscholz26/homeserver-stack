import { createRouter, createWebHistory } from 'vue-router'
import EinkaufView from '@/views/EinkaufView.vue'
import VerwaltungView from '@/views/VerwaltungView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: EinkaufView },
    { path: '/verwaltung', component: VerwaltungView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
