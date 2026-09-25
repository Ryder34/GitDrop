import fs from 'fs'
import path from 'path'

// Recursively walks a folder and returns every file inside it,
// each with its path relative to the folder root (so nested structure
// can be recreated on GitHub).
export function walkFolder(rootPath) {
  const results = []

  function walk(currentPath, relativePrefix) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue // skip dotfiles, matches your fs browser

      const fullPath = path.join(currentPath, entry.name)
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walk(fullPath, relativePath)
      } else {
        const size = fs.statSync(fullPath).size
        results.push({ path: fullPath, relativePath, name: entry.name, size })
      }
    }
  }

  walk(rootPath, '')
  return results
}