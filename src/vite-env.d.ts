/// <reference types="vite/client" />

declare module 'simpleheat' {
  export type HeatPoint = [number, number, number]
  export interface SimpleHeat {
    data(points: HeatPoint[]): SimpleHeat
    max(max: number): SimpleHeat
    radius(r: number, blur?: number): SimpleHeat
    gradient(grad: Record<string, string>): SimpleHeat
    draw(minOpacity?: number): SimpleHeat
  }
  function simpleheat(canvas: HTMLCanvasElement): SimpleHeat
  export default simpleheat
}
