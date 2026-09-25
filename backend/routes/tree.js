import express from 'express'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'

const router = express.Router()

// GET /api/tree/:owner/:repo?path=some/folder&branch=main
router.get('/:owner/:repo', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo } = req.params
  const { path: folderPath = '', branch } = req.query

  const octokit = new Octokit({ auth: config.token })

  try {
    // If no branch given, find the repo's default branch first
    let branchName = branch
    if (!branchName) {
      const { data: repoData } = await octokit.repos.get({ owner, repo })
      branchName = repoData.default_branch
    }

    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: folderPath,
      ref: branchName,
    })

    // data is an array when path is a folder, a single object when it's a file
    const items = Array.isArray(data) ? data : [data]

    const folders = items
      .filter((item) => item.type === 'dir')
      .map((item) => ({ name: item.name, path: item.path }))

    res.json({ folders, branch: branchName })
  } catch (err) {
    if (err.status === 404) {
      // Empty repo or path doesn't exist yet — treat as no subfolders
      return res.json({ folders: [], branch: branch || null })
    }
    res.status(500).json({ error: 'Failed to read repo contents' })
  }
})

export default router