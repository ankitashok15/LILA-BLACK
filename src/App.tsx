import { MapCanvas } from '@/components/MapCanvas'
import { Sidebar } from '@/components/Sidebar'
import { useBootstrapIndex, useChunkLoader } from '@/hooks/useDataLoader'
import { useAppStore } from '@/store/useAppStore'

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        ok ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'
      }`}
    >
      {label}
    </span>
  )
}

export default function App() {
  useBootstrapIndex()
  useChunkLoader()
  const indexStatus = useAppStore((s) => s.indexStatus)
  const chunkStatus = useAppStore((s) => s.chunkStatus)
  const selectedMatchId = useAppStore((s) => s.selectedMatchId)
  const chunkData = useAppStore((s) => s.chunkData)
  const selectedMap = useAppStore((s) => s.selectedMap)
  const selectedDateKey = useAppStore((s) => s.selectedDateKey)
  const matchCount = chunkData ? Object.keys(chunkData.matches).length : 0

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="font-semibold tracking-tight text-zinc-100">LILA BLACK</h1>
            <p className="text-sm text-zinc-500">Player behavior visualizer — static JSON + multi-layer canvas</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <StatusChip label="index loaded" ok={indexStatus === 'ok'} />
              <StatusChip label="chunk loaded" ok={chunkStatus === 'ok'} />
              <StatusChip label="match selected" ok={Boolean(selectedMatchId)} />
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                {selectedMap && selectedDateKey ? `${selectedMap} · ${selectedDateKey}` : 'no chunk selected'}
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                {matchCount} matches in chunk
              </span>
            </div>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-zinc-600">
            Events are from the human file owner: Kill = human vs human, BotKill = human killed bot, Killed / BotKilled =
            death to human / bot.
          </p>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 p-4 lg:flex-row">
        <Sidebar />
        <MapCanvas />
      </main>
    </div>
  )
}
