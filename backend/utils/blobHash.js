import fs from 'fs'
import crypto from 'crypto'

// Computes the same SHA-1 hash Git uses to identify a blob's content.
// Git's formula: sha1("blob " + fileSizeInBytes + "\0" + fileContents)
export function gitBlobHash(filePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size
    const header = `blob ${size}\0`

    const hash = crypto.createHash('sha1')
    hash.update(header)

    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}