import { useEffect } from 'react'
import { chunkFileName, useAppStore } from '@/store/useAppStore'
import type { ChunkData, MatchesIndex } from '@/types/data'

const INDEX_URL = '/data/matches_index.json'

async function fetchJson<T>(urls: string[]): Promise<T> {
  let lastError: Error | null = null
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return (await res.json()) as T
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error('Failed to fetch data')
}

export function useBootstrapIndex() {
  const setIndex = useAppStore((s) => s.setIndex)
  const selectChunk = useAppStore((s) => s.selectChunk)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIndex(null, 'loading')
      try {
        const data = await fetchJson<MatchesIndex>(['/api/chunks', INDEX_URL])
        if (cancelled) return
        setIndex(data, 'ok')
        const st = useAppStore.getState()
        if (data.chunks.length && !st.selectedMap) {
          const first = data.chunks[0]!
          selectChunk(first.map, first.dateKey)
        }
      } catch (e) {
        if (!cancelled) setIndex(null, 'error', e instanceof Error ? e.message : 'Failed to load index')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setIndex, selectChunk])
}

export function useChunkLoader() {
  const selectedMap = useAppStore((s) => s.selectedMap)
  const selectedDateKey = useAppStore((s) => s.selectedDateKey)
  const setChunk = useAppStore((s) => s.setChunk)
  const setSelectedMatchId = useAppStore((s) => s.setSelectedMatchId)

  useEffect(() => {
    if (!selectedMap || !selectedDateKey) {
      setChunk(null, 'idle')
      return
    }
    let cancelled = false
    const directUrl = `/data/${chunkFileName(selectedMap, selectedDateKey)}`
    const apiUrl = `/api/chunk?map=${encodeURIComponent(selectedMap)}&dateKey=${encodeURIComponent(selectedDateKey)}`
    ;(async () => {
      setChunk(null, 'loading')
      try {
        const data = await fetchJson<ChunkData>([apiUrl, directUrl])
        if (cancelled) return
        setChunk(data, 'ok')
        const ids = Object.keys(data.matches)
        setSelectedMatchId(ids.length ? ids[0]! : null)
      } catch (e) {
        if (!cancelled)
          setChunk(null, 'error', e instanceof Error ? e.message : 'Chunk load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedMap, selectedDateKey, setChunk, setSelectedMatchId])
}
