import { useMemo } from 'react'
import { EVENT_ORDER, EVENT_STYLE } from '@/lib/eventStyles'
import { chunkFileName, useAppStore } from '@/store/useAppStore'

const EVENT_TYPES = [...EVENT_ORDER]

export function Sidebar() {
  const index = useAppStore((s) => s.index)
  const indexStatus = useAppStore((s) => s.indexStatus)
  const indexError = useAppStore((s) => s.indexError)
  const selectedMap = useAppStore((s) => s.selectedMap)
  const selectedDateKey = useAppStore((s) => s.selectedDateKey)
  const selectChunk = useAppStore((s) => s.selectChunk)
  const chunkStatus = useAppStore((s) => s.chunkStatus)
  const chunkError = useAppStore((s) => s.chunkError)
  const chunkData = useAppStore((s) => s.chunkData)
  const selectedMatchId = useAppStore((s) => s.selectedMatchId)
  const setSelectedMatchId = useAppStore((s) => s.setSelectedMatchId)
  const currentTimeS = useAppStore((s) => s.currentTimeS)
  const setCurrentTimeS = useAppStore((s) => s.setCurrentTimeS)
  const isPlaying = useAppStore((s) => s.isPlaying)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)
  const playbackSpeed = useAppStore((s) => s.playbackSpeed)
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed)
  const showBots = useAppStore((s) => s.showBots)
  const setShowBots = useAppStore((s) => s.setShowBots)
  const showHeatmap = useAppStore((s) => s.showHeatmap)
  const setShowHeatmap = useAppStore((s) => s.setShowHeatmap)
  const enabledEventTypes = useAppStore((s) => s.enabledEventTypes)
  const toggleEventType = useAppStore((s) => s.toggleEventType)
  const hoverPlayerId = useAppStore((s) => s.hoverPlayerId)
  const selectedPlayerId = useAppStore((s) => s.selectedPlayerId)
  const setSelectedPlayerId = useAppStore((s) => s.setSelectedPlayerId)

  const chunks = useMemo(() => index?.chunks ?? [], [index])
  const currentChunkMeta = useMemo(
    () => chunks.find((c) => c.map === selectedMap && c.dateKey === selectedDateKey),
    [chunks, selectedMap, selectedDateKey],
  )

  const matchIds = useMemo(
    () => (chunkData ? Object.keys(chunkData.matches).sort() : []),
    [chunkData],
  )
  const activeMatch = selectedMatchId ? chunkData?.matches[selectedMatchId] : undefined
  const chunkSummary = useMemo(() => {
    if (!chunkData) return null
    let players = 0
    let events = 0
    for (const m of Object.values(chunkData.matches)) {
      players += m.player_count
      for (const p of Object.values(m.players)) events += p.events.length
    }
    return { players, events }
  }, [chunkData])

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Data</h2>
        {indexStatus === 'loading' && <p className="text-sm text-zinc-400">Loading index…</p>}
        {indexStatus === 'error' && (
          <p className="text-sm text-red-400">{indexError ?? 'Index error'}</p>
        )}
        {indexStatus === 'ok' && (
          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">Map + day chunk</label>
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200"
              value={selectedMap && selectedDateKey ? `${selectedMap}|${selectedDateKey}` : ''}
              onChange={(e) => {
                const v = e.target.value
                const [map, dk] = v.split('|')
                if (map && dk) selectChunk(map, dk)
              }}
            >
              <option value="">Select…</option>
              {chunks.map((c) => (
                <option key={`${c.map}_${c.dateKey}`} value={`${c.map}|${c.dateKey}`}>
                  {c.map} — {c.dateKey}
                  {c.partial ? ' (partial)' : ''} · {c.matchCount} matches
                </option>
              ))}
            </select>
            {currentChunkMeta?.partial && (
              <p className="text-xs text-amber-400/90">
                Partial day: fewer Parquet files (collection was ongoing). Data is still shown.
              </p>
            )}
            <p className="font-mono text-[10px] text-zinc-600">
              {selectedMap && selectedDateKey ? `/data/${chunkFileName(selectedMap, selectedDateKey)}` : ''}
            </p>
          </div>
        )}
        {chunkStatus === 'loading' && <p className="mt-2 text-sm text-zinc-400">Loading chunk…</p>}
        {chunkStatus === 'error' && <p className="mt-2 text-sm text-red-400">{chunkError}</p>}
        {chunkSummary && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <div className="rounded border border-zinc-800 bg-zinc-950 py-1">
              <div className="text-zinc-500">Chunks</div>
              <div className="font-mono text-zinc-200">{chunks.length}</div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-950 py-1">
              <div className="text-zinc-500">Players</div>
              <div className="font-mono text-zinc-200">{chunkSummary.players}</div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-950 py-1">
              <div className="text-zinc-500">Events</div>
              <div className="font-mono text-zinc-200">{chunkSummary.events}</div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Match</h2>
        {matchIds.length === 0 ? (
          <p className="text-sm text-zinc-500">Load a chunk to list matches.</p>
        ) : (
          <>
            <select
              className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200"
              value={selectedMatchId ?? ''}
              onChange={(e) => setSelectedMatchId(e.target.value || null)}
            >
              {matchIds.map((id) => (
                <option key={id} value={id}>
                  {id.slice(0, 12)}…
                </option>
              ))}
            </select>
            {activeMatch && (
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-zinc-400">
                <dt>Duration</dt>
                <dd className="font-mono text-zinc-300">{activeMatch.duration_s.toFixed(1)}s</dd>
                <dt>Players</dt>
                <dd className="font-mono text-zinc-300">
                  {activeMatch.player_count} ({activeMatch.human_count}H / {activeMatch.bot_count}B)
                </dd>
              </dl>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Playback</h2>
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={!activeMatch}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <span className="font-mono text-sm text-zinc-300">{currentTimeS.toFixed(1)}s</span>
        </div>
        <input
          type="range"
          className="mb-2 w-full"
          min={0}
          max={activeMatch ? activeMatch.duration_s : 0}
          step={0.1}
          value={Math.min(currentTimeS, activeMatch?.duration_s ?? 0)}
          disabled={!activeMatch}
          onChange={(e) => setCurrentTimeS(Number(e.target.value))}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Speed ×{playbackSpeed.toFixed(2)}
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          />
        </label>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Layers & filters</h2>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />
          Show bots
        </label>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
          Heatmap (simpleheat)
        </label>
        <p className="mb-1 text-xs text-zinc-500">Event types</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPES.map((t) => (
            <label
              key={t}
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
            >
              <input
                type="checkbox"
                checked={enabledEventTypes.has(t)}
                onChange={() => toggleEventType(t)}
              />
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: EVENT_STYLE[t].color }}
                title={`${t} color`}
              />
              {t}
            </label>
          ))}
        </div>
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-2">
          <p className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Color reference</p>
          <div className="grid grid-cols-1 gap-1 text-xs text-zinc-300">
            {EVENT_TYPES.map((t) => (
              <div key={`legend-${t}`} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_STYLE[t].color }} />
                <span>{EVENT_STYLE[t].label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">QA panel</h2>
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              setCurrentTimeS(0)
              setIsPlaying(false)
            }}
          >
            Reset playback
          </button>
          <button
            type="button"
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => setSelectedPlayerId(null)}
          >
            Clear selection
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-zinc-400">
          <dt>Hovered player</dt>
          <dd className="truncate font-mono text-zinc-300">{hoverPlayerId ?? '-'}</dd>
          <dt>Selected player</dt>
          <dd className="truncate font-mono text-zinc-300">{selectedPlayerId ?? '-'}</dd>
          <dt>Active endpoint</dt>
          <dd className="truncate font-mono text-zinc-300">
            {selectedMap && selectedDateKey ? `/data/${chunkFileName(selectedMap, selectedDateKey)}` : '-'}
          </dd>
        </dl>
      </section>
    </aside>
  )
}
