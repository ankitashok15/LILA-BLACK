import { readChunk } from './_lib/data.js'

export default async function handler(req, res) {
  const map = typeof req.query.map === 'string' ? req.query.map : ''
  const dateKey = typeof req.query.dateKey === 'string' ? req.query.dateKey : ''

  if (!map || !dateKey) {
    res.status(400).json({ ok: false, error: 'Required query params: map, dateKey' })
    return
  }

  try {
    const chunk = await readChunk(map, dateKey)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    res.status(200).json(chunk)
  } catch (err) {
    res.status(404).json({
      ok: false,
      error: `Chunk not found for ${map}_${dateKey}`,
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

