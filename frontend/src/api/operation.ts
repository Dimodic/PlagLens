/**
 * Async operation polling helpers.
 */
import { useEffect, useState } from 'react';
import api from './client';
import type { Operation, OperationStatus } from './types';

const TERMINAL: OperationStatus[] = ['completed', 'failed', 'cancelled'];

export async function getOperation(id: string): Promise<Operation> {
  const { data } = await api.get<Operation>(`/operations/${id}`);
  return data;
}

export async function cancelOperation(id: string): Promise<void> {
  await api.post(`/operations/${id}:cancel`);
}

export interface UseOperationOpts {
  intervalMs?: number;
  enabled?: boolean;
  onComplete?: (op: Operation) => void;
  onFail?: (op: Operation) => void;
}

/**
 * React hook to poll an operation until it reaches a terminal state.
 * Light-weight; for heavier needs use useQuery directly.
 */
export function useOperation(id: string | null, opts: UseOperationOpts = {}) {
  const { intervalMs = 2000, enabled = true, onComplete, onFail } = opts;
  const [op, setOp] = useState<Operation | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id || !enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<void> => {
      try {
        const fresh = await getOperation(id);
        if (cancelled) return;
        setOp(fresh);
        if (TERMINAL.includes(fresh.status)) {
          if (fresh.status === 'completed') onComplete?.(fresh);
          else onFail?.(fresh);
          return;
        }
        timer = setTimeout(tick, intervalMs);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, intervalMs, enabled, onComplete, onFail]);

  return { operation: op, error };
}

export const isTerminal = (s: OperationStatus): boolean => TERMINAL.includes(s);
