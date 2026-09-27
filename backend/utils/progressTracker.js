import { EventEmitter } from 'events'
import fs from 'fs'
import { PassThrough } from 'stream'

// One emitter per active upload "job", identified by a random id.
// The frontend gets the id back from the upload response headers (or we
// generate it up front and pass it in), connects an SSE stream to it,
// and we push progress events as the file streams to GitHub.
const jobEmitters = new Map()

export function getOrCreateJob(jobId) {
  if (!jobEmitters.has(jobId)) {
    jobEmitters.set(jobId, new EventEmitter())
  }
  return jobEmitters.get(jobId)
}
export function getJobEmitter(jobId) {
  return jobEmitters.get(jobId)
}

export function cleanupJob(jobId) {
  jobEmitters.delete(jobId)
}

export function createTrackedStream(filePath, totalSize, onProgress) {
  const source = fs.createReadStream(filePath)
  const tracked = new PassThrough()
  let sent = 0

  source.on('data', (chunk) => {
    sent += chunk.length
    onProgress(sent, totalSize)
  })

  source.on('error', (err) => tracked.destroy(err))

  source.pipe(tracked)
  return tracked
}