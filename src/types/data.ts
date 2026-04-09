/** Matches §18 JSON schema (per map/date chunk). */
export interface MatchEvent {
  t: number
  type: string
  px: number
  pz: number
}

export interface PlayerRecord {
  is_bot: boolean
  /** Full-rate positions for heatmap & binary search (path renderer uses every 3rd). */
  px: number[]
  pz: number[]
  ts: number[]
  events: MatchEvent[]
}

export interface MatchRecord {
  map: string
  date: string
  duration_s: number
  player_count: number
  human_count: number
  bot_count: number
  players: Record<string, PlayerRecord>
}

export interface ChunkData {
  matches: Record<string, MatchRecord>
}

export interface ChunkIndexEntry {
  map: string
  /** e.g. Feb10 — file stem suffix */
  dateKey: string
  /** basename: AmbroseValley_Feb10.json */
  file: string
  partial?: boolean
  matchCount: number
}

export interface MatchesIndex {
  chunks: ChunkIndexEntry[]
}
