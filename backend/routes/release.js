import express from 'express'
import fs from 'fs'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'

const router = express.Router()
const RELEASE_TAG = 'gitdrop-storage'

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
      const existing = existingByName.get(file.name)
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
// body: { owner, repo, releaseId, files: [{ path, name }] }
router.post('/upload', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo, releaseId, files } = req.body
  const octokit = new Octokit({ auth: config.token })

  if (!releaseId || releaseId === 'null' || releaseId === 'undefined') {
    return res.status(400).json({ error: 'Missing valid releaseId for uploading assets.' })
  }

  try {
    // Get current assets so we can delete any we're about to overwrite
    const { data: release } = await octokit.repos.getRelease({
      owner,
      repo,
      release_id: releaseId,
    })
    const assetsArray = release?.assets || [];
    const existingByName = new Map(assetsArray.map((a) => [a.name, a]))

    const uploaded = []
    for (const file of files) {
      // If an asset with this name already exists, delete it first —
      // GitHub doesn't allow two assets with the same name on one release
      const existing = existingByName.get(file.name)
      if (existing) {
        await octokit.repos.deleteReleaseAsset({
          owner,
          repo,
          asset_id: existing.id,
        })
      }

      const stats = fs.statSync(file.path)
      const stream = fs.createReadStream(file.path)

      const { data: asset } = await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: releaseId,
        name: file.name,
        data: stream,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': stats.size,
        },
      })

      uploaded.push({ name: asset.name, url: asset.browser_download_url })
    }

    res.json({ success: true, uploaded, releaseUrl: release.html_url })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Release upload failed' })
  }
})

export default router