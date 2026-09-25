import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { walkFolder } from '../utils/walkFolder.js'

const router = express.Router()
const allowedRoot = os.homedir() // restrict browsing to under your home folder

router.get('/list', (req, res) => {
  const requestedPath = req.query.path || allowedRoot
  const resolved = path.resolve(requestedPath)

  // Security: don't allow escaping outside the home directory
  if (!resolved.startsWith(allowedRoot)) {
    return res.status(400).json({ error: 'Path not allowed' })
  }

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const items = entries
      .filter((e) => !e.name.startsWith('.')) // hide dotfiles/folders
      .map((e) => {
        const fullPath = path.join(resolved, e.name)
        const isDir = e.isDirectory()
        return {
          name: e.name,
          path: fullPath,
          isDir,
          size: isDir ? null : fs.statSync(fullPath).size,
        }
      })
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))

    res.json({ path: resolved, items })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read directory' })
  }
})

router.get('/defaults', (req, res) => {
  const home = os.homedir()
  res.json({
    home,
    downloads: path.join(home, 'Downloads'),
  })
})

router.get('/walk', (req, res) => {
  const requestedPath = req.query.path
  if (!requestedPath) {
    return res.status(400).json({ error: 'path is required' })
  }

  const resolved = path.resolve(requestedPath)
  if (!resolved.startsWith(allowedRoot)) {
    return res.status(400).json({ error: 'Path not allowed' })
  }

  try {
    const files = walkFolder(resolved)
    const totalSize = files.reduce((sum, f) => sum + f.size, 0)
    res.json({
      rootName: path.basename(resolved),
      fileCount: files.length,
      totalSize,
      files,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to walk folder' })
  }
})

export default router