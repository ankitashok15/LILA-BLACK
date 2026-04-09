import { create } from 'zustand'
import type { ChunkData, MatchesIndex } from '@/types/data'

export type LoadStatus = 'idle' | 'loading' | 'ok' | 'error'

const DEFAULT_EVENTS = new Set([
  'Kill',
  'BotKill',
  'Killed',
  'BotKilled',
  'Loot',
  'Extract',
  'Death',
])

export interface ViewTransform {
  /** CSS pixels: map coord * k + tx */
  k: number
  tx: number
  ty: number
}

interface AppState {
  index: MatchesIndex | null
  indexStatus: LoadStatus
  indexError: string | null

  selectedMap: string | null
  selectedDateKey: string | null
  selectedMatchId: string | null

  chunkData: ChunkData | null
  chunkStatus: LoadStatus
  chunkError: string | null

  currentTimeS: number
  isPlaying: boolean
  playbackSpeed: number

  showBots: boolean
  showHeatmap: boolean
  enabledEventTypes: Set<string>

  view: ViewTransform

  hoverMap: { px: number; pz: number } | null
  hoverPlayerId: string | null
  selectedPlayerId: string | null

  setIndex: (index: MatchesIndex | null, status: LoadStatus, err?: string | null) => void
  selectChunk: (map: string | null, dateKey: string | null) => void
  setChunk: (data: ChunkData | null, status: LoadStatus, err?: string | null) => void
  setSelectedMatchId: (id: string | null) => void
  setCurrentTimeS: (t: number) => void
  setIsPlaying: (v: boolean) => void
  setPlaybackSpeed: (v: number) => void
  setShowBots: (v: boolean) => void
  setShowHeatmap: (v: boolean) => void
  toggleEventType: (type: string) => void
  setView: (v: Partial<ViewTransform>) => void
  resetView: (w: number, h: number) => void
  setHover: (map: { px: number; pz: number } | null, playerId: string | null) => void
  setSelectedPlayerId: (id: string | null) => void
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export const useAppStore = create<AppState>((set) => ({
  index: null,
  indexStatus: 'idle',
  indexError: null,

  selectedMap: null,
  selectedDateKey: null,
  selectedMatchId: null,

  chunkData: null,
  chunkStatus: 'idle',
  chunkError: null,

  currentTimeS: 0,
  isPlaying: false,
  playbackSpeed: 1,

  showBots: true,
  showHeatmap: false,
  enabledEventTypes: new Set(DEFAULT_EVENTS),

  view: { k: 1, tx: 0, ty: 0 },

  hoverMap: null,
  hoverPlayerId: null,
  selectedPlayerId: null,

  setIndex: (index, indexStatus, indexError = null) => set({ index, indexStatus, indexError }),

  selectChunk: (selectedMap, selectedDateKey) =>
    set({
      selectedMap,
      selectedDateKey,
      selectedMatchId: null,
      chunkData: null,
      chunkStatus: 'idle',
      chunkError: null,
      currentTimeS: 0,
      isPlaying: false,
    }),

  setChunk: (chunkData, chunkStatus, chunkError = null) => set({ chunkData, chunkStatus, chunkError }),

  setSelectedMatchId: (selectedMatchId) =>
    set({
      selectedMatchId,
      currentTimeS: 0,
      isPlaying: false,
      hoverPlayerId: null,
      selectedPlayerId: null,
    }),

  setCurrentTimeS: (currentTimeS) => set({ currentTimeS }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed: clamp(playbackSpeed, 0.25, 8) }),
  setShowBots: (showBots) => set({ showBots }),
  setShowHeatmap: (showHeatmap) => set({ showHeatmap }),

  toggleEventType: (type) =>
    set((s) => {
      const next = new Set(s.enabledEventTypes)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return { enabledEventTypes: next }
    }),

  setView: (partial) => set((s) => ({ view: { ...s.view, ...partial } })),

  resetView: (w, h) => {
    const k = (Math.min(w, h) / 1024) * 0.92
    set({
      view: {
        k,
        tx: (w - 1024 * k) / 2,
        ty: (h - 1024 * k) / 2,
      },
    })
  },

  setHover: (hoverMap, hoverPlayerId) => set({ hoverMap, hoverPlayerId }),
  setSelectedPlayerId: (selectedPlayerId) => set({ selectedPlayerId }),
}))

export function chunkFileName(map: string, dateKey: string): string {
  return `${map}_${dateKey}.json`
}
