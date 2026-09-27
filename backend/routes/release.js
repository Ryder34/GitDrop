import express from 'express'
import fs from 'fs'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'

import { getOrCreateJob, getJobEmitter, cleanupJob, createTrackedStream } from '../utils/progressTracker.js'

const router = express.Router()
const RELEASE_TAG = 'gitdrop-storage'

// GitHub replaces characters it doesn't allow in release asset names.
// Spaces and most non-alphanumeric characters become dots.
function sanitizeAssetName(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '.')
    .replace(/\.+/g, '.') // collapse consecutive dots into one, matching GitHub's own behavior
}
function findAvailableName(desiredName, existingNames) {
  const sanitizedDesired = sanitizeAssetName(desiredName)
  if (!existingNames.has(sanitizedDesired)) return sanitizedDesired

  const dotIndex = desiredName.lastIndexOf('.')
  const base = dotIndex > 0 ? desiredName.slice(0, dotIndex) : desiredName
  const ext = dotIndex > 0 ? desiredName.slice(dotIndex) : ''

  let counter = 1
  let candidate
  do {
    candidate = sanitizeAssetName(`${base} (${counter})${ext}`)
    counter++
  } while (existingNames.has(candidate))

  return candidate
}
// Finds the GitDrop release, creating it if it doesn't exist yet.
async function getOrCreateRelease(octokit, owner, repo) {
  try {
    const { data } = await octokit.repos.getReleaseByTag({
      owner,
      repo,
      tag: RELEASE_TAG,
    })
    return data
  } catch (err) {
    if (err.status !== 404) throw err
  }

  const { data } = await octokit.repos.createRelease({
    owner,
    repo,
    tag_name: RELEASE_TAG,
    name: 'GitDrop Files',
    body: 'Large files stored by GitDrop. Do not delete this release.',
    draft: false,
    prerelease: false,
  })
  return data
}

// POST /api/release/check
// body: { owner, repo, files: [{ name }] }
router.post('/check', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo, files } = req.body
  const octokit = new Octokit({ auth: config.token })

  try {
    const release = await getOrCreateRelease(octokit, owner, repo)
    const existingByName = new Map(release.assets.map((a) => [a.name, a]))

    const results = files.map((file) => {
      const sanitizedName = sanitizeAssetName(file.name)
      const existing = existingByName.get(sanitizedName)
      return {
        name: file.name,
        status: existing ? 'conflict' : 'new',
      }
    })

    res.json({ releaseId: release.id, results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to check release assets' })
  }
})

// POST /api/release/upload
// body: { owner, repo, releaseId, files: [{ path, name }], jobId }
router.post('/upload', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo, releaseId, files, jobId } = req.body
  const octokit = new Octokit({ auth: config.token })

  if (!releaseId || releaseId === 'null' || releaseId === 'undefined') {
    return res.status(400).json({ error: 'Missing valid releaseId for uploading assets.' })
  }

  const emitter = jobId ? getOrCreateJob(jobId) : null

  try {
    const { data: release } = await octokit.repos.getRelease({
      owner,
      repo,
      release_id: releaseId,
    })
    const assetsArray = release?.assets || []
    const existingByName = new Map(assetsArray.map((a) => [a.name, a]))

    const uploaded = []
    for (const file of files) {
      const stats = fs.statSync(file.path)

      let sanitizedName
      let existing
      console.log('DEBUG file received:', { name: file.name, forceRename: file.forceRename })
      if (file.forceRename) {
        // "Keep both" was chosen — find the next actually-free name instead of guessing (1)
        sanitizedName = findAvailableName(file.name, new Set(existingByName.keys()))
        existing = null // it's guaranteed free, no delete needed
      } else {
        sanitizedName = sanitizeAssetName(file.name)
        existing = existingByName.get(sanitizedName)
      }

      if (existing) {
        await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id: existing.id })

        let stillExists = true
        let attempts = 0
        while (stillExists && attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          const { data: check } = await octokit.repos.getRelease({ owner, repo, release_id: releaseId })
          stillExists = check.assets.some((a) => a.name === sanitizedName)
          attempts++
        }
        if (stillExists) {
          return res.status(500).json({ error: `Could not confirm deletion of ${file.name} after 10s — try again` })
        }
      }

      // Use the tracked stream so we can report real upload progress
      const stream = emitter
        ? createTrackedStream(file.path, stats.size, (sent, total) => {
            emitter.emit('progress', { fileName: file.name, sent, total, percent: Math.round((sent / total) * 100) })
          })
        : fs.createReadStream(file.path)

      const { data: asset } = await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: releaseId,
        name: sanitizedName,
        data: stream,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': stats.size,
        },
      })
      uploaded.push({ name: asset.name, url: asset.browser_download_url })
    }

    if (emitter) {
      emitter.emit('done')
      cleanupJob(jobId)
    }

    res.json({ success: true, uploaded, releaseUrl: release.html_url })
  } catch (err) {
    console.error(err)
    if (emitter) {
      emitter.emit('done')
      cleanupJob(jobId)
    }
    res.status(500).json({ error: err.message || 'Release upload failed' })
  }
})

// GET /api/release/:owner/:repo
// Lists all assets in the GitDrop release (or empty if none exists yet)
router.get('/:owner/:repo', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo } = req.params
  const octokit = new Octokit({ auth: config.token })

  try {
    const { data } = await octokit.repos.getReleaseByTag({
      owner,
      repo,
      tag: RELEASE_TAG,
    })
    const assets = data.assets.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      url: a.browser_download_url,
      createdAt: a.created_at,
    }))
    res.json({ assets, releaseUrl: data.html_url })
  } catch (err) {
    if (err.status === 404) {
      return res.json({ assets: [], releaseUrl: null }) // no release yet
    }
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to fetch release assets' })
  }
})

// DELETE /api/release/:owner/:repo/asset/:assetId
router.delete('/:owner/:repo/asset/:assetId', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo, assetId } = req.params
  const octokit = new Octokit({ auth: config.token })

  try {
    await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id: assetId })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Delete failed' })
  }
})

export default router