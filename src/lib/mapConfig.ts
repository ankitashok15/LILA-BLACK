/** §19 — world (x,z) → minimap pixel 0..1024 after image resize. */
export const MAP_SIZE = 1024

export interface MapWorldConfig {
  scale: number
  originX: number
  originZ: number
}

export const MAP_WORLD: Record<string, MapWorldConfig> = {
  AmbroseValley: { scale: 900, originX: -370, originZ: -473 },
  GrandRift: { scale: 581, originX: -290, originZ: -290 },
  Lockdown: { scale: 1000, originX: -500, originZ: -500 },
}

export function worldToPixel(
  mapName: string,
  x: number,
  z: number,
): { px: number; pz: number } {
  const c = MAP_WORLD[mapName]
  if (!c) return { px: 0, pz: 0 }
  const u = (x - c.originX) / c.scale
  const v = (z - c.originZ) / c.scale
  return {
    px: u * MAP_SIZE,
    pz: (1 - v) * MAP_SIZE,
  }
}
