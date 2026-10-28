// The activity log: one Job per long-running device operation, pushed to the
// renderer as it progresses. Jobs are in-memory only and capped so a long
// session cannot grow without bound.
import { randomUUID } from 'crypto';
import type { Job, JobKind } from '../../shared/types';
import { Manager as Broadcast } from '../Broadcast';

const MAX_JOBS = 300;
const MAX_OUTPUT_CHARS = 20000;

let Jobs = new Map<string, Job>();
let AnnounceTimer: ReturnType<typeof setTimeout> | null = null;

function announce(): void {
  // Output arrives in bursts; coalesce to one push per frame-ish.
  if (AnnounceTimer) return;
  AnnounceTimer = setTimeout(() => {
    AnnounceTimer = null;
    Broadcast.emit('JobsUpdated', Manager.GetAll());
  }, 50);
}

function trim(): void {
  if (Jobs.size <= MAX_JOBS) return;
  const Finished = [...Jobs.values()]
    .filter((j) => j.Status === 'success' || j.Status === 'failed')
    .sort((a, b) => (a.FinishedAt ?? 0) - (b.FinishedAt ?? 0));
  for (const Job of Finished) {
    if (Jobs.size <= MAX_JOBS) break;
    Jobs.delete(Job.ID);
  }
}

export interface JobHandle {
  readonly ID: string;
  Start(): void;
  Append(text: string): void;
  Succeed(message?: string): void;
  Fail(error: string): void;
}

export const Manager = {
  GetAll(): Job[] {
    return [...Jobs.values()].sort((a, b) => b.CreatedAt - a.CreatedAt);
  },

  Get(id: string): Job | null {
    return Jobs.get(id) ?? null;
  },

  Create(kind: JobKind, serial: string | null, label: string): JobHandle {
    const ID = randomUUID();
    Jobs.set(ID, {
      ID,
      Kind: kind,
      Serial: serial,
      Label: label,
      Status: 'queued',
      Output: '',
      Error: null,
      CreatedAt: Date.now(),
      StartedAt: null,
      FinishedAt: null,
    });
    trim();
    announce();

    const update = (patch: Partial<Job>) => {
      const Current = Jobs.get(ID);
      if (!Current) return;
      Jobs.set(ID, { ...Current, ...patch });
      announce();
    };

    return {
      ID,
      Start: () => update({ Status: 'running', StartedAt: Date.now() }),
      Append: (text) => {
        const Current = Jobs.get(ID);
        if (!Current || !text) return;
        let Output = Current.Output + text;
        if (Output.length > MAX_OUTPUT_CHARS)
          Output = Output.slice(Output.length - MAX_OUTPUT_CHARS);
        update({ Output });
      },
      Succeed: (message) => {
        const Current = Jobs.get(ID);
        const Output = message
          ? `${Current?.Output ?? ''}${Current?.Output ? '\n' : ''}${message}`
          : (Current?.Output ?? '');
        update({ Status: 'success', FinishedAt: Date.now(), Output });
      },
      Fail: (error) => update({ Status: 'failed', FinishedAt: Date.now(), Error: error }),
    };
  },

  ClearFinished(): void {
    for (const [ID, Job] of Jobs) {
      if (Job.Status === 'success' || Job.Status === 'failed') Jobs.delete(ID);
    }
    announce();
  },

  ResetForTests(): void {
    Jobs = new Map();
    if (AnnounceTimer) clearTimeout(AnnounceTimer);
    AnnounceTimer = null;
  },
};
