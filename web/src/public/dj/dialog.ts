// jsdom y navegadores viejos no tienen showModal(): se degrada a [open] sin romper.
const returnFocus = new WeakMap<HTMLDialogElement, HTMLElement>();

export function openDialog(d: HTMLDialogElement): void {
  if (d.open) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) returnFocus.set(d, active);
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
}

export function closeDialog(d: HTMLDialogElement): void {
  if (d.open) {
    if (typeof d.close === 'function') d.close();
    else d.removeAttribute('open');
  }
  const back = returnFocus.get(d);
  if (back) {
    returnFocus.delete(d);
    back.focus({ preventScroll: true });
  }
}
