export function mutationCountDelta(changed: boolean, direction: 1 | -1): 1 | 0 | -1 {
  if (!changed) return 0;
  return direction;
}

export function applyMutationCountDelta(current: number, delta: 1 | 0 | -1): number {
  return Math.max(0, current + delta);
}
