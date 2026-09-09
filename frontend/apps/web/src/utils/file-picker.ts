/**
 * Opening the camera or the photo library from a button.
 *
 * WHY THIS IS NOT A <input> IN THE COMPONENT'S JSX
 * ================================================
 *
 * Ali, 2026-09-09 (iPad): "PICTURE IS WORKING FROM TH GELLERY FROM THE CAMERA
 * IT IS NOT WORING".
 *
 * Picking from the library is fast: iOS draws a sheet over the page, the page
 * stays alive, the change event lands on the same element that opened it.
 *
 * The camera is a different animal. It takes over the whole screen for as long
 * as it takes a person to frame a shot, and iOS backgrounds the web page behind
 * it. React can re-render in the meantime, and a re-render can replace the
 * <input> node — so the photo comes back to an element that is no longer there
 * and the change event goes nowhere. Nothing errors. Nothing appears. Which is
 * exactly what Ali saw.
 *
 * `PhotoCapture.tsx` never had this problem because it builds the input with
 * document.createElement — outside React's tree, so no re-render can touch it.
 * This is that pattern, extracted so both use one copy.
 *
 * The `capture` attribute matters too: with it, the button goes STRAIGHT to the
 * camera instead of showing the Photo Library / Take Photo / Choose File sheet.
 * One tap, one job, and the ambiguous sheet is gone from the path entirely.
 */

export interface FilePickerOptions {
  /** e.g. 'image/*' */
  accept: string;
  /** 'environment' = rear camera, 'user' = selfie. Omit for the library. */
  capture?: 'environment' | 'user';
  multiple?: boolean;
}

/**
 * Opens the picker and calls back with what the person chose.
 *
 * Nothing is called if they cancel — every caller must survive that silently.
 */
export function openFilePicker(
  options: FilePickerOptions,
  onFiles: (files: File[]) => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options.accept;
  if (options.capture) input.setAttribute('capture', options.capture);
  if (options.multiple) input.multiple = true;

  // Off-screen rather than display:none — a hidden input is ignored by some
  // mobile browsers. It has to be in the document so the element (and this
  // handler with it) survives until the camera hands the photo back.
  input.style.position = 'fixed';
  input.style.left = '-10000px';
  input.style.top = '0';
  input.setAttribute('aria-hidden', 'true');

  let settled = false;
  const cleanup = () => {
    window.removeEventListener('focus', onWindowFocus);
    if (input.parentNode) input.parentNode.removeChild(input);
  };

  // A cancelled picker fires no event at all. The page regaining focus is the
  // only signal we get, and it also fires when the camera RETURNS a photo — so
  // give the change event a moment to win before tidying up.
  const onWindowFocus = () => {
    window.setTimeout(() => {
      if (!settled) cleanup();
    }, 1500);
  };

  input.onchange = () => {
    settled = true;
    const files = Array.from(input.files || []);
    cleanup();
    if (files.length) onFiles(files);
  };

  document.body.appendChild(input);
  window.addEventListener('focus', onWindowFocus);
  input.click();
}

/** Straight to the rear camera. */
export const openCamera = (onFile: (file: File) => void) =>
  openFilePicker({ accept: 'image/*', capture: 'environment' }, (files) => onFile(files[0]));

/** Straight to the photo library. */
export const openGallery = (onFile: (file: File) => void) =>
  openFilePicker({ accept: 'image/*' }, (files) => onFile(files[0]));
