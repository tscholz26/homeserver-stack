import { createRouter, createWebHistory } from 'vue-router'
import EinkaufView from '@/views/EinkaufView.vue'
import VerwaltungView from '@/views/VerwaltungView.vue'
import RezeptbuchView from '@/views/RezeptbuchView.vue'
import WocheView from '@/views/WocheView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: EinkaufView },
    { path: '/woche', component: WocheView },
    { path: '/rezepte/:id?', component: RezeptbuchView },
    { path: '/verwaltung', component: VerwaltungView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
