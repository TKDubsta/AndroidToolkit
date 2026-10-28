// Thin wrappers over the Bootstrap modal show/hide calls.

export function openModal(id: string): void {
  $('#' + id).modal('show');
}

export function closeModal(id: string): void {
  $('#' + id).modal('hide');
}

export function closeAllModals(): void {
  $('.modal').modal('hide');
}

/** Run `fn` once, the next time the given modal finishes hiding. */
export function onceHidden(id: string, fn: () => void): void {
  $('#' + id).one('hidden.bs.modal', fn);
}
