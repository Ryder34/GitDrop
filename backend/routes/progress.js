import express from 'express'
import { getOrCreateJob } from '../utils/progressTracker.js'

const router = express.Router()

// GET /api/progress/:jobId  (Server-Sent Events stream)
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params
  const emitter = getOrCreateJob(jobId)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const onProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  const onDone = () => {
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  }

  emitter.on('progress', onProgress)
  emitter.on('done', onDone)

  req.on('close', () => {
    emitter.off('progress', onProgress)
    emitter.off('done', onDone)
  })
})

export default router