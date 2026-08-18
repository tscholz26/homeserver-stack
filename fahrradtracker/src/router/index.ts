import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import VerwaltungView from '@/views/VerwaltungView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/verwaltung', component: VerwaltungView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
