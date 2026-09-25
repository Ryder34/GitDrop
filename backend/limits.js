// All size thresholds in one place, in bytes, so they're easy to tune later.

export const COMMIT_MAX_BYTES = 45 * 1024 * 1024 // stay under GitHub's ~50MB warning; blobs are base64 (~33% bigger over the wire)
export const RELEASE_ASSET_MAX_BYTES = 2 * 1024 * 1024 * 1024 // GitHub's per-asset cap (~2GB)

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv', '.m4v',
])

export function isVideoFile(name) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext)
}

// Decide how a single file should be uploaded, based on its size and type.
export function routeFile(sizeBytes, name) {
  if (sizeBytes > RELEASE_ASSET_MAX_BYTES) {
    return 'blocked' // too big even for a release asset
  }
  if (sizeBytes > COMMIT_MAX_BYTES) {
    return 'release'
  }
  if (isVideoFile(name)) {
    return 'release' // route videos to Release even if small, per the plan
  }
  return 'commit'
}