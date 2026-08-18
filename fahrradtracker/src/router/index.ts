import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import RaederView from '@/views/RaederView.vue'
import FahrtenView from '@/views/FahrtenView.vue'
import StatsView from '@/views/StatsView.vue'
import VerwaltungView from '@/views/VerwaltungView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/raeder', component: RaederView },
    { path: '/fahrten', component: FahrtenView },
    { path: '/stats', component: StatsView },
    { path: '/verwaltung', component: VerwaltungView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
