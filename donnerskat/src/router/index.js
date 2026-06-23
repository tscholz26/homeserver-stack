import { createRouter, createWebHistory } from 'vue-router'
import EntryView from '../views/EntryView.vue'
import OverviewView from '../views/OverviewView.vue'
import PlayersView from '../views/PlayersView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/eintragung' },
    { path: '/eintragung', name: 'entry', component: EntryView },
    { path: '/uebersicht', name: 'overview', component: OverviewView },
    { path: '/spieler', name: 'players', component: PlayersView },
  ],
})

export default router
