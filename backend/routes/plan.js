import express from 'express'
import fs from 'fs'
import path from 'path'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'
import { gitBlobHash } from '../utils/blobHash.js'
import { routeFile } from '../limits.js'

const router = express.Router()

// POST /api/plan
// body: { owner, repo, branch, files: [{ path, name, targetPath }] }
router.post('/', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo, branch, files } = req.body
  const octokit = new Octokit({ auth: config.token })

  try {
    // Route each file first (size/type based), and split off anything too big to hash
    const routed = files.map((file) => {
      const size = fs.statSync(file.path).size
      const method = routeFile(size, file.name)
      return { ...file, size, method }
    })

    const blocked = routed.filter((f) => f.method === 'blocked')
    const releasePending = routed.filter((f) => f.method === 'release')
    const commitCandidates = routed.filter((f) => f.method === 'commit')

    // Group commit-path files by their destination folder, so we only
    // fetch each folder's remote listing once even if many files share it
    const folderCache = new Map() // destFolder -> Map(name -> remote entry)

    async function getFolderListing(destFolder) {
      if (folderCache.has(destFolder)) return folderCache.get(destFolder)

      let remoteEntries = []
      try {
        const { data } = await octokit.repos.getContent({
          owner,
          repo,
          path: destFolder,
          ref: branch,
        })
        remoteEntries = Array.isArray(data) ? data : [data]
      } catch (err) {
        if (err.status !== 404) throw err
      }

      const byName = new Map(remoteEntries.map((e) => [e.name, e]))
      folderCache.set(destFolder, byName)
      return byName
    }

    const commitResults = []
    for (const file of commitCandidates) {
      const destFolder = path.dirname(file.targetPath) // '.' if no folder
      const folderPath = destFolder === '.' ? '' : destFolder
      const remoteByName = await getFolderListing(folderPath)
      const remote = remoteByName.get(file.name)

      let status
      if (!remote) {
        status = 'new'
      } else if (remote.type === 'dir') {
        status = 'name-clash-folder'
      } else {
        const localHash = await gitBlobHash(file.path)
        status = remote.sha === localHash ? 'identical' : 'conflict'
      }

      commitResults.push({ ...file, status })
    }

    const results = [
      ...blocked.map((f) => ({ ...f, status: 'blocked' })),
      ...releasePending.map((f) => ({ ...f, status: 'release-pending' })),
      ...commitResults,
    ]

    res.json({ results })
  } catch (err) {
    console.error(err)
    if (err.status === 404) {
      return res.status(404).json({ error: 'Repository not found — it may have been deleted or renamed' })
    }
    res.status(500).json({ error: err.message || 'Failed to check conflicts' })
  }
})

export default router