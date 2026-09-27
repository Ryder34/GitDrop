import express from 'express'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'

const router = express.Router()

router.get('/', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }
  const octokit = new Octokit({ auth: config.token })
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: 'pushed',
  })
  res.json(
    repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
    }))
  )
})

router.post('/', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { name, description, isPrivate } = req.body
  if (!name) {
    return res.status(400).json({ error: 'Repository name is required' })
  }

  const octokit = new Octokit({ auth: config.token })

  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name,
      description: description || '',
      private: isPrivate !== false, // default to private unless explicitly false
      auto_init: true, // creates an initial commit with a README, so the repo isn't empty
    })

    res.json({
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      private: data.private,
      defaultBranch: data.default_branch,
    })
  } catch (err) {
    if (err.status === 422) {
      return res.status(422).json({ error: 'A repository with that name already exists' })
    }
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to create repository' })
  }
})

router.get('/:owner/:repo/branches', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo } = req.params
  const octokit = new Octokit({ auth: config.token })

  try {
    const branches = await octokit.paginate(octokit.repos.listBranches, {
      owner,
      repo,
      per_page: 100,
    })

    const { data: repoData } = await octokit.repos.get({ owner, repo })

    res.json({
      branches: branches.map((b) => b.name),
      defaultBranch: repoData.default_branch,
    })
  } catch (err) {
    console.error(err)
    if (err.status === 404) {
      return res.status(404).json({ error: 'Repository not found' })
    }
    res.status(500).json({ error: err.message || 'Failed to list branches' })
  }
})

router.post('/:owner/:repo/branches', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo } = req.params
  const { name, fromBranch } = req.body

  if (!name) {
    return res.status(400).json({ error: 'Branch name is required' })
  }

  const octokit = new Octokit({ auth: config.token })

  try {
    // Get the SHA of the branch we're branching from
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${fromBranch}`,
    })

    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${name}`,
      sha: refData.object.sha,
    })

    res.json({ success: true, name })
  } catch (err) {
    console.error(err)
    if (err.status === 422) {
      return res.status(422).json({ error: 'A branch with that name already exists' })
    }
    res.status(500).json({ error: err.message || 'Failed to create branch' })
  }
})

export default router