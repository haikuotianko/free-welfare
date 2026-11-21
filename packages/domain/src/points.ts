export interface PointLotLike {
  id: string;
  remaining: number;
  expiresAt?: Date | null;
}

export interface PointAllocation {
  id: string;
  amount: number;
}

export interface AllocationResult {
  used: number;
  remaining: number;
  allocations: PointAllocation[];
}

/**
 * Spend points FIFO: earliest expiry first, never-expiring lots last.
 */
export function allocateFifo(lots: PointLotLike[], amount: number): AllocationResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { used: 0, remaining: 0, allocations: [] };
  }

  const ordered = [...lots].sort((a, b) => {
    if (a.expiresAt == null && b.expiresAt == null) return a.id.localeCompare(b.id);
    if (a.expiresAt == null) return 1;
    if (b.expiresAt == null) return -1;
    return a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id);
  });

  let need = amount;
  const allocations: PointAllocation[] = [];

  for (const lot of ordered) {
    if (need <= 0) break;
    const use = Math.min(Math.max(lot.remaining, 0), need);
    if (use <= 0) continue;
    allocations.push({ id: lot.id, amount: use });
    need -= use;
  }

  return { used: amount - need, remaining: need, allocations };
}
