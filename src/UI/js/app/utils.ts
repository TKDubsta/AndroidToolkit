// Shared renderer helpers.

/** THE HTML escaper: every interpolated value in markup passes through it. */
export function Safe(Input: unknown): string {
  if (typeof Input === 'string') {
    return Input.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  if (Array.isArray(Input)) return Input.map(Safe).join(',');
  if (Input === null || Input === undefined) return '';
  return Safe(String(Input));
}

/** Close a message off as a sentence; non-strings pass through. */
export function WithFullStop(Message: unknown): unknown {
  if (typeof Message !== 'string') return Message;
  const Trimmed = Message.trimEnd();
  if (!Trimmed) return Message;
  return /[.!?…]$/.test(Trimmed) ? Trimmed : `${Trimmed}.`;
}

export function ErrorMessage(Err: unknown, Fallback = ''): string {
  if (Err && typeof Err === 'object' && 'message' in Err) {
    const Message = (Err as { message?: unknown }).message;
    if (typeof Message === 'string' && Message.length > 0) return Message;
  }
  if (Fallback) return Fallback;
  return String(Err);
}

export function HandleNonFatalError(Context: unknown, Error: unknown = null): void {
  try {
    const Label = Context ? `[NonFatal] ${Context}` : '[NonFatal]';
    if (Error) console.warn(Label, Error);
    else console.warn(Label);
  } catch {
    /* last-resort reporter; must never throw */
  }
}

export function FormatBytes(Bytes: unknown): string {
  const n = typeof Bytes === 'number' ? Bytes : Number(Bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const Units = ['KB', 'MB', 'GB', 'TB'];
  let Value = n / 1024;
  let Index = 0;
  while (Value >= 1024 && Index < Units.length - 1) {
    Value /= 1024;
    Index += 1;
  }
  return `${Value < 10 ? Value.toFixed(1) : Math.round(Value)} ${Units[Index]}`;
}

/** Relative "3s ago" / "2m ago" label for job timestamps. */
export function FormatAgo(Timestamp: number | null, Now = Date.now()): string {
  if (Timestamp === null || !Number.isFinite(Timestamp)) return '';
  const Seconds = Math.max(0, Math.round((Now - Timestamp) / 1000));
  if (Seconds < 60) return `${Seconds}s ago`;
  const Minutes = Math.round(Seconds / 60);
  if (Minutes < 60) return `${Minutes}m ago`;
  const Hours = Math.round(Minutes / 60);
  return `${Hours}h ago`;
}

export function IsMac(): boolean {
  return typeof window !== 'undefined' && window.PLATFORM === 'darwin';
}
