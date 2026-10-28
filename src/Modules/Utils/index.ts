// Small shared utilities: an async wait helper plus the `[Err, Data]`
// result-tuple constructors (`Ok`/`Fail`) used by every manager.
import type { Result } from '../../types/result';

export function Wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function Ok<T = null>(value: T = null as T): Result<T> {
  return [null, value];
}

export function Fail<T = null>(error: string): Result<T> {
  return [error || 'Unknown Error', null];
}

/** Extract a readable message from a thrown value. */
export function ErrorMessage(Err: unknown, Fallback = 'Unknown error'): string {
  if (Err && typeof Err === 'object' && 'message' in Err) {
    const Message = (Err as { message?: unknown }).message;
    if (typeof Message === 'string' && Message) return Message;
  }
  if (typeof Err === 'string' && Err) return Err;
  return Fallback;
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving
 * order in the result. Used for fan-out over many devices.
 */
export async function MapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const Results: R[] = new Array(items.length);
  let Next = 0;
  const Workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (Next < items.length) {
      const Index = Next++;
      Results[Index] = await fn(items[Index] as T, Index);
    }
  });
  await Promise.all(Workers);
  return Results;
}
