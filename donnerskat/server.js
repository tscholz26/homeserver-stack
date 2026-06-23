import express from 'express'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')
const AVATARS_DIR = join(__dirname, 'avatars')
const PORT = Number(process.env.PORT) || 2605

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(AVATARS_DIR, { recursive: true })

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      hands: Array.isArray(parsed.hands) ? parsed.hands : [],
    }
  } catch {
    return { players: [], hands: [] }
  }
}

function writeState(data) {
  writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8')
}

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.static(join(__dirname, 'dist')))
app.use('/avatars', express.static(AVATARS_DIR))

app.get('/api/state', (_req, res) => {
  res.json(readState())
})

app.put('/api/state', (req, res) => {
  try {
    const { players, hands } = req.body
    if (!Array.isArray(players) || !Array.isArray(hands)) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    writeState({ players, hands })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// SPA fallback (app.use catches all remaining routes in Express 5)
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Donnerskat läuft auf http://0.0.0.0:${PORT}`)
})
