import { readIndex } from './_lib/data.js'

export default async function handler(_req, res) {
  try {
    const index = await readIndex()
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    res.status(200).json(index)
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'Failed to load chunks index',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

