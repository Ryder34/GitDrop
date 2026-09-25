import express from 'express'
import os from 'os'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'

const router = express.Router()

// GET /api/browse/:owner/:repo?path=&branch=
// Lists both files and folders (unlike /api/tree, which only returns folders)
router.get('/:owner/:repo', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo } = req.params
  const { path: folderPath = '', branch } = req.query
  const octokit = new Octokit({ auth: config.token })

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: folderPath,
      ref: branch,
    })

    const items = Array.isArray(data) ? data : [data]
    const entries = items.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type, // 'file' or 'dir'
      size: item.size,
    }))

    res.json({ entries })
  } catch (err) {
    if (err.status === 404) {
      return res.json({ entries: [] })
    }
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to browse repo' })
  }
})

// GET /api/browse/:owner/:repo/download?path=&branch=&saveTo=
// Downloads a single file from the repo to a local path
router.get('/:owner/:repo/download', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo } = req.params
  const { path: filePath, branch, saveTo } = req.query

  if (!filePath) {
    return res.status(400).json({ error: 'path is required' })
  }
  const targetDir = saveTo || os.homedir()  

  const octokit = new Octokit({ auth: config.token })

  try {
    // Get the raw download URL for this file, then fetch it and stream to disk
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    })

    if (Array.isArray(data) || data.type !== 'file') {
      return res.status(400).json({ error: 'Path is not a file' })
    }

    const fileRes = await fetch(data.download_url)
    if (!fileRes.ok) throw new Error('Failed to fetch file content')

    const fs = await import('fs')
    const path = await import('path')
    const targetPath = path.join(targetDir, data.name)

    const fileStream = fs.createWriteStream(targetPath)
    await new Promise((resolve, reject) => {
      fileRes.body.pipeTo(
        new WritableStream({
          write(chunk) {
            fileStream.write(chunk)
          },
          close() {
            fileStream.end()
            resolve()
          },
          abort(err) {
            reject(err)
          },
        })
      ).catch(reject)
    })

    res.json({ success: true, savedTo: targetPath })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Download failed' })
  }
})

export default router