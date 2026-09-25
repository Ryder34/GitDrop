import express from 'express'
import fs from 'fs'
import { Octokit } from '@octokit/rest'
import { readConfig } from '../config.js'

const router = express.Router()

// POST /api/upload
// body: { owner, repo, branch, destPath, files: [{ path, name }], message }
router.post('/', async (req, res) => {
  const config = readConfig()
  if (!config.token) {
    return res.status(401).json({ error: 'Not connected' })
  }

  const { owner, repo, branch, files, message } = req.body
  const octokit = new Octokit({ auth: config.token })

  try {
    // 1. Get the current commit and tree for the branch
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    })
    const baseCommitSha = refData.object.sha

    const { data: baseCommit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: baseCommitSha,
    })
    const baseTreeSha = baseCommit.tree.sha

    // 2. Upload each file as a blob
    const treeItems = []
    for (const file of files) {
      const content = fs.readFileSync(file.path, { encoding: 'base64' })
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content,
        encoding: 'base64',
      })

      treeItems.push({
        path: file.targetPath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      })
    }

    // 3. Create a new tree on top of the existing one
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    })

    // 4. Create a commit pointing to that tree
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: message || `Add ${files.length} file(s) via GitDrop`,
      tree: newTree.sha,
      parents: [baseCommitSha],
    })

    // 5. Move the branch to point at the new commit
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    })

    res.json({ success: true, commitUrl: newCommit.html_url })
  } catch (err) {
    console.error(err)
    if (err.status === 404) {
      return res.status(404).json({ error: 'Repository not found — it may have been deleted or renamed' })
    }
    res.status(500).json({ error: err.message || 'Upload failed' })
  }
})

export default router