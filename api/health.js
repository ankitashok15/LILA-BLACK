export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: true,
    service: 'lila-black-api',
    ts: new Date().toISOString(),
  })
}

