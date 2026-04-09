import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DATA_ROOT = path.join(process.cwd(), 'public', 'data')

function safeName(v) {
  return String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '')
}

export async function readIndex() {
  const p = path.join(DATA_ROOT, 'matches_index.json')
  const txt = await readFile(p, 'utf8')
  return JSON.parse(txt)
}

export async function readChunk(map, dateKey) {
  const file = `${safeName(map)}_${safeName(dateKey)}.json`
  const p = path.join(DATA_ROOT, file)
  const txt = await readFile(p, 'utf8')
  return JSON.parse(txt)
}

