import { useCallback, useEffect, useRef } from 'react'
import simpleheat from 'simpleheat'
import { upperBoundLe } from '@/lib/binarySearch'
import { colorForEvent } from '@/lib/eventStyles'
import { MAP_SIZE } from '@/lib/mapConfig'
import { playerHue } from '@/lib/playerColor'
import { useAppStore } from '@/store/useAppStore'
import type { MatchRecord } from '@/types/data'

const PATH_STEP = 3
const HOVER_RADIUS_MAP = 10
const MIN_K = 0.15
const MAX_K = 48

function applyViewTransform(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  k: number,
  tx: number,
  ty: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(tx, ty)
  ctx.scale(k, k)
}

function getMatch(): MatchRecord | null {
  const s = useAppStore.getState()
  const id = s.selectedMatchId
  const chunk = s.chunkData
  if (!id || !chunk?.matches[id]) return null
  return chunk.matches[id]!
}

function collectHeatPoints(match: MatchRecord, showBots: boolean): [number, number, number][] {
  const pts: [number, number, number][] = []
  for (const p of Object.values(match.players)) {
    if (!showBots && p.is_bot) continue
    const n = p.px.length
    for (let i = 0; i < n; i++) {
      pts.push([p.px[i]!, p.pz[i]!, 1])
    }
  }
  return pts
}

export function MapCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const c0 = useRef<HTMLCanvasElement>(null)
  const c1 = useRef<HTMLCanvasElement>(null)
  const c2 = useRef<HTMLCanvasElement>(null)
  const c3 = useRef<HTMLCanvasElement>(null)
  const c4 = useRef<HTMLCanvasElement>(null)
  const heatCanvas = useRef<HTMLCanvasElement | null>(null)
  const minimapRef = useRef<HTMLImageElement | null>(null)
  const minimapMap = useRef<Map<string, HTMLImageElement>>(new Map())
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 })

  const selectedMap = useAppStore((s) => s.selectedMap)
  const chunkStatus = useAppStore((s) => s.chunkStatus)
  const chunkData = useAppStore((s) => s.chunkData)
  const selectedMatchId = useAppStore((s) => s.selectedMatchId)
  const currentTimeS = useAppStore((s) => s.currentTimeS)
  const viewK = useAppStore((s) => s.view.k)
  const viewTx = useAppStore((s) => s.view.tx)
  const viewTy = useAppStore((s) => s.view.ty)
  const showBots = useAppStore((s) => s.showBots)
  const showHeatmap = useAppStore((s) => s.showHeatmap)
  const enabledEventTypes = useAppStore((s) => s.enabledEventTypes)
  const hoverMap = useAppStore((s) => s.hoverMap)
  const hoverPlayerId = useAppStore((s) => s.hoverPlayerId)
  const selectedPlayerId = useAppStore((s) => s.selectedPlayerId)
  const enabledSig = [...enabledEventTypes].sort().join('|')

  const draw = useCallback(() => {
    const s = useAppStore.getState()
    const { dpr } = sizeRef.current
    const layers = [c0.current, c1.current, c2.current, c3.current, c4.current]
    for (const c of layers) {
      if (!c) continue
      const ctx = c.getContext('2d')
      if (!ctx) continue
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
    }

    const match = getMatch()
    const { k, tx, ty } = s.view
    const img = minimapRef.current

    const drawLayer0 = () => {
      const c = c0.current
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      applyViewTransform(ctx, dpr, k, tx, ty)
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, 0, 0, MAP_SIZE, MAP_SIZE)
      } else {
        ctx.fillStyle = '#1e1e2e'
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)
        ctx.strokeStyle = '#444'
        ctx.lineWidth = 2 / k
        ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE)
      }
    }

    const drawLayer1 = () => {
      const c = c1.current
      if (!c || !match) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      applyViewTransform(ctx, dpr, k, tx, ty)
      const tCut = s.currentTimeS
      for (const [uid, p] of Object.entries(match.players)) {
        if (!s.showBots && p.is_bot) continue
        const col = playerHue(uid, p.is_bot)
        const { px, pz, ts } = p
        if (px.length < 2) continue
        const idx = upperBoundLe(ts, tCut)
        const endBright = Math.max(0, Math.min(idx + 1, px.length))

        const strokePath = (from: number, to: number) => {
          if (to - from < 1) return
          ctx.beginPath()
          let started = false
          for (let i = from; i < to; i += PATH_STEP) {
            const x = px[i]!
            const z = pz[i]!
            if (!started) {
              ctx.moveTo(x, z)
              started = true
            } else ctx.lineTo(x, z)
          }
          const lastI = to - 1
          if (lastI >= from && (lastI % PATH_STEP !== 0 || to - from === 1) && started) {
            ctx.lineTo(px[lastI]!, pz[lastI]!)
          }
          ctx.stroke()
        }

        ctx.strokeStyle = col
        ctx.lineWidth = 2 / k
        ctx.globalAlpha = 0.18
        strokePath(0, px.length)

        ctx.globalAlpha = 0.95
        if (endBright >= 2) strokePath(0, endBright)
        ctx.globalAlpha = 1
      }
    }

    const drawLayer2 = () => {
      const c = c2.current
      if (!c || !match) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      applyViewTransform(ctx, dpr, k, tx, ty)
      const tCut = s.currentTimeS
      const r = 4 / k
      for (const [, p] of Object.entries(match.players)) {
        if (!s.showBots && p.is_bot) continue
        for (const ev of p.events) {
          if (ev.t > tCut) continue
          if (!s.enabledEventTypes.has(ev.type)) continue
          ctx.beginPath()
          ctx.fillStyle = colorForEvent(ev.type)
          ctx.arc(ev.px, ev.pz, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const drawLayer3 = () => {
      const c = c3.current
      if (!c || !match || !s.showHeatmap) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      applyViewTransform(ctx, dpr, k, tx, ty)
      let hc = heatCanvas.current
      if (!hc) {
        hc = document.createElement('canvas')
        hc.width = MAP_SIZE
        hc.height = MAP_SIZE
        heatCanvas.current = hc
      }
      const hctx = hc.getContext('2d')
      if (hctx) {
        hctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
      }
      const pts = collectHeatPoints(match, s.showBots)
      if (pts.length === 0) return
      const heat = simpleheat(hc)
      heat.radius(18, 12)
      heat.max(Math.min(80, pts.length / 8 + 5))
      heat.data(pts)
      heat.draw(0.12)
      ctx.globalAlpha = 0.55
      ctx.drawImage(hc, 0, 0, MAP_SIZE, MAP_SIZE)
      ctx.globalAlpha = 1
    }

    const drawLayer4 = () => {
      const c = c4.current
      if (!c || !match) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      applyViewTransform(ctx, dpr, k, tx, ty)
      const tCut = s.currentTimeS
      for (const [uid, p] of Object.entries(match.players)) {
        if (!s.showBots && p.is_bot) continue
        const idx = upperBoundLe(p.ts, tCut)
        if (idx < 0) continue
        const x = p.px[idx]!
        const z = p.pz[idx]!
        const highlight = s.selectedPlayerId === uid || s.hoverPlayerId === uid
        if (highlight) {
          ctx.beginPath()
          ctx.strokeStyle = '#fafafa'
          ctx.lineWidth = (highlight ? 3 : 2) / k
          ctx.arc(x, z, (highlight ? 9 : 6) / k, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      if (s.hoverMap) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(250,250,250,0.35)'
        ctx.lineWidth = 1 / k
        ctx.arc(s.hoverMap.px, s.hoverMap.pz, HOVER_RADIUS_MAP, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    drawLayer0()
    drawLayer1()
    drawLayer2()
    drawLayer3()
    drawLayer4()
  }, [])

  useEffect(() => {
    if (!selectedMap) {
      minimapRef.current = null
      draw()
      return
    }
    const cached = minimapMap.current.get(selectedMap)
    if (cached?.complete) {
      minimapRef.current = cached
      draw()
      return
    }
    const img = new Image()
    img.onload = () => {
      minimapMap.current.set(selectedMap, img)
      minimapRef.current = img
      draw()
    }
    img.onerror = () => {
      minimapRef.current = null
      draw()
    }
    img.src = `/data/minimaps/${selectedMap}.png`
  }, [selectedMap, draw])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, rect.width)
      const h = Math.max(1, rect.height)
      sizeRef.current = { w, h, dpr }
      for (const c of [c0, c1, c2, c3, c4]) {
        const node = c.current
        if (!node) continue
        node.width = Math.floor(w * dpr)
        node.height = Math.floor(h * dpr)
        node.style.width = `${w}px`
        node.style.height = `${h}px`
      }
      useAppStore.getState().resetView(w, h)
      draw()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    draw()
  }, [
    draw,
    chunkData,
    selectedMatchId,
    currentTimeS,
    viewK,
    viewTx,
    viewTy,
    showBots,
    showHeatmap,
    enabledSig,
    hoverMap?.px,
    hoverMap?.pz,
    hoverPlayerId,
    selectedPlayerId,
  ])

  const isPlaying = useAppStore((s) => s.isPlaying)
  const playbackSpeed = useAppStore((s) => s.playbackSpeed)

  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const st = useAppStore.getState()
      if (!st.isPlaying) return
      const m = st.selectedMatchId ? st.chunkData?.matches[st.selectedMatchId] : undefined
      const maxT = m?.duration_s ?? 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      let next = st.currentTimeS + dt * st.playbackSpeed
      if (next >= maxT) {
        next = maxT
        st.setIsPlaying(false)
      }
      st.setCurrentTimeS(next)
      if (useAppStore.getState().isPlaying) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, playbackSpeed])

  const screenToMap = (sx: number, sy: number) => {
    const { k, tx, ty } = useAppStore.getState().view
    return { mx: (sx - tx) / k, my: (sy - ty) / k }
  }

  const pickPlayer = (mx: number, my: number): string | null => {
    const s = useAppStore.getState()
    const match = getMatch()
    if (!match) return null
    let best: { id: string; d2: number } | null = null
    const tCut = s.currentTimeS
    const r2 = HOVER_RADIUS_MAP * HOVER_RADIUS_MAP
    for (const [uid, p] of Object.entries(match.players)) {
      if (!s.showBots && p.is_bot) continue
      const idx = upperBoundLe(p.ts, tCut)
      if (idx >= 0) {
        const dx = p.px[idx]! - mx
        const dy = p.pz[idx]! - my
        const d2 = dx * dx + dy * dy
        if (d2 <= r2 * 4 && (!best || d2 < best.d2)) best = { id: uid, d2 }
      }
      for (const ev of p.events) {
        if (ev.t > tCut) break
        const dx = ev.px - mx
        const dy = ev.pz - my
        const d2 = dx * dx + dy * dy
        if (d2 <= r2 * 2 && (!best || d2 < best.d2)) best = { id: uid, d2 }
      }
    }
    return best?.id ?? null
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const s = useAppStore.getState()
    const { k, tx, ty } = s.view
    const mx = (sx - tx) / k
    const my = (sy - ty) / k
    const factor = Math.exp(-e.deltaY * 0.0012)
    const nk = Math.min(MAX_K, Math.max(MIN_K, k * factor))
    const ntx = sx - mx * nk
    const nty = sy - my * nk
    s.setView({ k: nk, tx: ntx, ty: nty })
  }

  const drag = useRef<{ sx: number; sy: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { mx, my } = screenToMap(sx, sy)
    useAppStore.getState().setHover({ px: mx, pz: my }, pickPlayer(mx, my))

    const d = drag.current
    if (d) {
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      d.sx = e.clientX
      d.sy = e.clientY
      const v = useAppStore.getState().view
      useAppStore.getState().setView({ tx: v.tx + dx, ty: v.ty + dy })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onClick = () => {
    const s = useAppStore.getState()
    if (s.hoverPlayerId) s.setSelectedPlayerId(s.hoverPlayerId)
  }

  useEffect(() => {
    if (chunkStatus === 'ok') draw()
  }, [chunkStatus, draw])

  return (
    <div
      ref={wrapRef}
      className="relative min-h-[420px] flex-1 cursor-crosshair touch-none rounded-lg border border-zinc-800 bg-zinc-900/80"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        drag.current = null
        useAppStore.getState().setHover(null, null)
      }}
      onClick={onClick}
    >
      <canvas ref={c0} className="absolute inset-0" />
      <canvas ref={c1} className="absolute inset-0" />
      <canvas ref={c2} className="absolute inset-0" />
      <canvas ref={c3} className="absolute inset-0" />
      <canvas ref={c4} className="absolute inset-0" />
    </div>
  )
}
