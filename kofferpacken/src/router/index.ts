import { createRouter, createWebHistory } from 'vue-router'
import UserSelectView from '@/views/UserSelectView.vue'
import PackView from '@/views/PackView.vue'
import VerwaltungView from '@/views/VerwaltungView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: UserSelectView },
    { path: '/packliste', component: PackView },
    { path: '/verwaltung', component: VerwaltungView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// No password, just a chosen tile: the personal views need a user,
// and a device with a stored user skips the tile screen entirely
router.beforeEach((to) => {
  const userId = localStorage.getItem('koffer:userId')
  if (!userId && to.path !== '/') return '/'
  if (userId && to.path === '/') return '/packliste'
})

export default router
