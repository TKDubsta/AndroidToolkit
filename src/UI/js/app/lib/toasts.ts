// Transient UI: top-centre toasts, the compact confirmation toast, and the
// loud red critical confirmation used before a factory reset.
import { HandleNonFatalError, Safe, WithFullStop } from '../utils';

export function iconForType(type: unknown): string {
  const t = String(type || 'info').toLowerCase();
  if (t === 'success') return '<i class="bi bi-check-circle"></i>';
  if (t === 'warning') return '<i class="bi bi-exclamation-triangle"></i>';
  if (t === 'error') return '<i class="bi bi-x-circle"></i>';
  return '<i class="bi bi-info-circle"></i>';
}

function attachHoverPauseDismiss(el: HTMLElement, duration: number): void {
  if (!duration || duration <= 0) return;
  let remaining = duration;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastStart = Date.now();
  const clear = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
  const remove = () => {
    try {
      el.remove();
    } catch (e) {
      HandleNonFatalError('Toast:AutoRemove', e);
    }
  };
  const tick = () => {
    clear();
    lastStart = Date.now();
    timerId = setTimeout(remove, remaining);
  };
  el.addEventListener('mouseenter', () => {
    remaining -= Date.now() - lastStart;
    if (remaining < 0) remaining = 0;
    clear();
  });
  el.addEventListener('mouseleave', () => {
    if (remaining === 0) remove();
    else tick();
  });
  tick();
}

export function ensureToastHost(): HTMLElement {
  let host = document.getElementById('ALERTS_TOAST_HOST');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ALERTS_TOAST_HOST';
    document.body.appendChild(host);
  }
  return host;
}

export interface ToastOptions {
  title?: unknown;
  message?: unknown;
  type?: string;
  duration?: number;
}

export function showToast({
  title = '',
  message = '',
  type = 'info',
  duration = 5000,
}: ToastOptions): void {
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = 'alert-item alert-toast';
  el.setAttribute('data-severity', String(type || 'info').toLowerCase());
  const hasMessage = Boolean(message && String(message).trim().length > 0);
  if (!hasMessage) el.classList.add('single-line');
  el.innerHTML = `
    <div class="alert-icon">${iconForType(type)}</div>
    <div class="alert-content">
      <div><strong>${Safe(title || 'Notice')}</strong></div>
      ${hasMessage ? `<div class="alert-meta">${Safe(message)}</div>` : ''}
    </div>
    <div class="alert-dismiss">
      <button class="btn-dismiss" title="Dismiss" aria-label="Dismiss">✕</button>
    </div>`;
  host.appendChild(el);
  el.querySelector('.btn-dismiss')?.addEventListener('click', () => el.remove());
  attachHoverPauseDismiss(el, duration);
}

/** Every toast reads as a sentence. */
export function Notify(Message: unknown, Type = 'info', Duration = 5000): void {
  showToast({ title: WithFullStop(Message), type: Type, duration: Duration });
}

export interface ConfirmationDialogOptions {
  /** The confirm button's label in Title Case ("Reboot Devices"). */
  ConfirmLabel: string;
  /** Use the destructive red button (default) or a neutral one. */
  Danger?: boolean;
}

export function ConfirmationDialog(
  Message: unknown,
  Options: ConfirmationDialogOptions
): Promise<boolean> {
  return new Promise((resolve) => {
    document.getElementById('CONFIRM_TOAST')?.remove();
    const Danger = Options.Danger !== false;
    const $toast = $(`
      <div id="CONFIRM_TOAST" role="dialog" aria-live="assertive" aria-modal="true" class="confirm-toast no-drag">
        <div class="confirm-toast-body">
          <div class="confirm-toast-msg">${Safe(Message)}</div>
          <div class="confirm-toast-actions">
            <button type="button" class="btn btn-sm btn-secondary" id="CONFIRM_TOAST_CANCEL">Cancel</button>
            <button type="button" class="btn btn-sm ${Danger ? 'btn-danger' : 'btn-success'}" id="CONFIRM_TOAST_CONFIRM">${Safe(Options.ConfirmLabel)}</button>
          </div>
        </div>
      </div>`);
    $('body').append($toast);
    const $btnCancel = $toast.find('#CONFIRM_TOAST_CANCEL');
    const $btnConfirm = $toast.find('#CONFIRM_TOAST_CONFIRM');

    const cleanup = () => {
      $(document).off('keydown.confirmToast');
      $toast.remove();
    };
    $btnCancel.on('click', () => {
      cleanup();
      resolve(false);
    });
    $btnConfirm.on('click', () => {
      cleanup();
      resolve(true);
    });
    $(document).on('keydown.confirmToast', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const active = document.activeElement;
        if (active === $btnCancel.get(0)) return $btnCancel.trigger('click');
        return $btnConfirm.trigger('click');
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        return $btnCancel.trigger('click');
      }
      if (e.key === 'ArrowLeft') return $btnCancel.trigger('focus');
      if (e.key === 'ArrowRight') return $btnConfirm.trigger('focus');
    });
    setTimeout(() => $btnConfirm.trigger('focus'), 0);
  });
}

export interface CriticalConfirmationOptions {
  title: string;
  message: string;
  /** Names listed under the message (the target devices). */
  items?: string[];
  confirmLabel: string;
}

const CRITICAL_CONFIRM_MAX_ITEMS = 8;
let settleOpenCriticalConfirm: ((value: boolean) => void) | null = null;

/** Centred red modal whose DEFAULT is Cancel; Enter only confirms when Confirm has focus. */
export function CriticalConfirmationDialog(Options: CriticalConfirmationOptions): Promise<boolean> {
  if (settleOpenCriticalConfirm) settleOpenCriticalConfirm(false);

  return new Promise<boolean>((resolve) => {
    const Items = Array.isArray(Options.items) ? Options.items : [];
    const Shown = Items.slice(0, CRITICAL_CONFIRM_MAX_ITEMS);
    const Hidden = Items.length - Shown.length;
    const ItemsHtml = Shown.length
      ? `<ul class="critical-confirm-items">${Shown.map((Item) => `<li>${Safe(Item)}</li>`).join('')}${
          Hidden > 0 ? `<li class="critical-confirm-more">and ${Hidden} more</li>` : ''
        }</ul>`
      : '';

    const $dialog = $(`
      <div id="CRITICAL_CONFIRM" class="critical-confirm no-drag">
        <div class="critical-confirm-panel" role="alertdialog" aria-modal="true">
          <div class="critical-confirm-icon"><i class="bi bi-exclamation-octagon"></i></div>
          <h2 class="critical-confirm-title">${Safe(Options.title)}</h2>
          <div class="critical-confirm-msg">${Safe(Options.message)}</div>
          ${ItemsHtml}
          <div class="critical-confirm-actions">
            <button type="button" class="btn critical-confirm-cancel" id="CRITICAL_CONFIRM_CANCEL">Cancel</button>
            <button type="button" class="btn critical-confirm-go" id="CRITICAL_CONFIRM_GO">${Safe(Options.confirmLabel)}</button>
          </div>
        </div>
      </div>`);
    $('body').append($dialog);
    const $btnCancel = $dialog.find('#CRITICAL_CONFIRM_CANCEL');
    const $btnGo = $dialog.find('#CRITICAL_CONFIRM_GO');

    const settle = (value: boolean) => {
      settleOpenCriticalConfirm = null;
      $(document).off('keydown.criticalConfirm');
      $dialog.remove();
      resolve(value);
    };
    settleOpenCriticalConfirm = settle;

    $btnCancel.on('click', () => settle(false));
    $btnGo.on('click', () => settle(true));
    $dialog.on('mousedown', (e) => {
      if (e.target === $dialog.get(0)) settle(false);
    });
    $(document).on('keydown.criticalConfirm', (e) => {
      const onGo = document.activeElement === $btnGo.get(0);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        return settle(onGo);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        return settle(false);
      }
      if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const toGo = e.key === 'ArrowRight' || (e.key === 'Tab' && !onGo);
        return (toGo ? $btnGo : $btnCancel).trigger('focus');
      }
    });
    setTimeout(() => $btnCancel.trigger('focus'), 0);
  });
}
