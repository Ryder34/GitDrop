import fs from 'fs'
import os from 'os'
import path from 'path'

const configDir = path.join(os.homedir(), '.gitdrop')
const configPath = path.join(configDir, 'config.json')

export function readConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function writeConfig(data) {
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), { mode: 0o600 })
}
