// Activity panel: the job list with expandable output, and the count badge on
// the bottom-bar button.
import { GetDevice, Jobs, setJobs } from './state';
import { FormatAgo, Safe } from './utils';
import { DeviceTitle, JobIcon, SummarizeJobs } from './lib/device-view';
import { RenderDevices } from './devices';

const Expanded = new Set<string>();
let LastRunning = 0;

function jobRowHtml(jobId: string): string {
  const Job = Jobs.find((j) => j.ID === jobId);
  if (!Job) return '';
  const Device = Job.Serial ? GetDevice(Job.Serial) : null;
  const Who = Job.Serial
    ? Device
      ? `${DeviceTitle(Device)} · ${Job.Serial}`
      : Job.Serial
    : 'ADB server';
  const When = FormatAgo(Job.FinishedAt ?? Job.StartedAt ?? Job.CreatedAt);
  const Output = Expanded.has(Job.ID)
    ? `<pre class="job-output">${Safe(Job.Output || '(no output)')}${Job.Error ? `\n<span class="job-error">${Safe(Job.Error)}</span>` : ''}</pre>`
    : '';
  return `
    <div class="job-row" data-job="${Safe(Job.ID)}" data-status="${Job.Status}">
      <div class="job-icon"><i class="bi ${JobIcon(Job)}"></i></div>
      <div class="min-w-0">
        <div class="job-label">${Safe(Job.Label)}</div>
        <div class="job-serial">${Safe(Who)}${Job.Error && !Expanded.has(Job.ID) ? ` · ${Safe(Job.Error)}` : ''}</div>
      </div>
      <div class="job-status">${Job.Status}${When ? ` · ${When}` : ''}</div>
    </div>${Output}`;
}

export function RenderJobs(): void {
  const List = document.getElementById('ACTIVITY_LIST');
  const Count = document.getElementById('ACTIVITY_COUNT');
  const Button = document.getElementById('ACTIVITY_BTN');
  const Summary = SummarizeJobs(Jobs);

  if (Count && Button) {
    const Active = Summary.Running + Summary.Queued;
    const Shown = Active > 0 ? Active : Summary.Failed > 0 ? Summary.Failed : 0;
    Count.textContent = String(Shown);
    Count.classList.toggle('d-none', Shown === 0);
    Button.classList.toggle('has-running', Active > 0);
    Button.classList.toggle('has-failed', Active === 0 && Summary.Failed > 0);
  }

  if (List) {
    List.innerHTML = Jobs.length
      ? Jobs.map((j) => jobRowHtml(j.ID)).join('')
      : '<div class="form-text">No activity yet.</div>';
  }

  // The busy stripe on tiles follows the jobs, not the device list.
  if (Summary.Running !== LastRunning) {
    LastRunning = Summary.Running;
    RenderDevices();
  }
}

export function ToggleActivityPanel(force?: boolean): void {
  const Panel = document.getElementById('ACTIVITY_PANEL');
  if (!Panel) return;
  const Show = force ?? !Panel.classList.contains('show');
  Panel.classList.toggle('show', Show);
  if (Show) RenderJobs();
}

export function InitJobs(): void {
  document.getElementById('ACTIVITY_BTN')?.addEventListener('click', () => ToggleActivityPanel());
  document
    .getElementById('ACTIVITY_CLOSE_BTN')
    ?.addEventListener('click', () => ToggleActivityPanel(false));
  document
    .getElementById('ACTIVITY_CLEAR_BTN')
    ?.addEventListener('click', () => void window.API.ClearFinishedJobs());
  document.getElementById('ACTIVITY_LIST')?.addEventListener('click', (e) => {
    const Row = (e.target as HTMLElement).closest<HTMLElement>('.job-row');
    if (!Row?.dataset.job) return;
    if (Expanded.has(Row.dataset.job)) Expanded.delete(Row.dataset.job);
    else Expanded.add(Row.dataset.job);
    RenderJobs();
  });

  // Outside click closes the panel, like ShowTrak's execution toast.
  document.addEventListener('mousedown', (e) => {
    const Panel = document.getElementById('ACTIVITY_PANEL');
    if (!Panel?.classList.contains('show')) return;
    const Target = e.target as HTMLElement;
    if (Target.closest('#ACTIVITY_PANEL') || Target.closest('#ACTIVITY_BTN')) return;
    ToggleActivityPanel(false);
  });

  window.API.OnJobsUpdated((jobs) => {
    setJobs(jobs);
    RenderJobs();
  });
  // Keep the "ago" labels fresh while the panel is open.
  setInterval(() => {
    if (document.getElementById('ACTIVITY_PANEL')?.classList.contains('show')) RenderJobs();
  }, 10000);
}
