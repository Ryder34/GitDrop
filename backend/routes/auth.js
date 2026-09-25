import express from 'express'
import { Octokit } from '@octokit/rest'
import { readConfig, writeConfig } from '../config.js'

const router = express.Router()

// check whether we already have a saved, working token
router.get('/status', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.json({ connected: false })
  }
  try {
    const octokit = new Octokit({ auth: config.token })
    const { data: user } = await octokit.users.getAuthenticated()
    res.json({ connected: true, username: user.login })
  } catch {
    res.json({ connected: false })
  }
})

// save a new token, but only if it actually works
router.post('/', async (req, res) => {
  const { token } = req.body
  if (!token) {
    return res.status(400).json({ error: 'Token is required' })
  }
  try {
    const octokit = new Octokit({ auth: token })
    const { data: user } = await octokit.users.getAuthenticated()
    writeConfig({ token })
    res.json({ connected: true, username: user.login })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router