export interface EventStyle {
  color: string
  label: string
}

export const EVENT_STYLE: Record<string, EventStyle> = {
  Kill: { color: '#ef4444', label: 'Kill (human vs human)' },
  BotKill: { color: '#f97316', label: 'BotKill (human killed bot)' },
  Killed: { color: '#a855f7', label: 'Killed (human died to human)' },
  BotKilled: { color: '#8b5cf6', label: 'BotKilled (human died to bot)' },
  Loot: { color: '#22c55e', label: 'Loot' },
  Extract: { color: '#06b6d4', label: 'Extract' },
  Death: { color: '#64748b', label: 'Death' },
  KilledByStorm: { color: '#eab308', label: 'KilledByStorm' },
}

export const EVENT_ORDER = ['Kill', 'BotKill', 'Killed', 'BotKilled', 'Loot', 'Extract', 'Death'] as const

export function colorForEvent(type: string): string {
  return EVENT_STYLE[type]?.color ?? '#94a3b8'
}
