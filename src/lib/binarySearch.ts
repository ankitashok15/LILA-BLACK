/** Largest index i such that ts[i] <= t (ts sorted ascending). Returns -1 if none. */
export function upperBoundLe(ts: readonly number[], t: number): number {
  let lo = 0
  let hi = ts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ts[mid]! <= t) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}
