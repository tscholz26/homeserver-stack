import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import DashboardView from '@/views/DashboardView.vue'
import SoonView from '@/views/SoonView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
    { path: '/dashboard', component: DashboardView },
    { path: '/bald/:id?', component: SoonView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
