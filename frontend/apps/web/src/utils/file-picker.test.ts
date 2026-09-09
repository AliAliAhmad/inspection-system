import { describe, it, expect, vi } from 'vitest';
import { openFilePicker, openCamera, openGallery } from './file-picker';

/**
 * Ali's bug, 2026-09-09 (iPad): "PICTURE IS WORKING FROM TH GELLERY FROM THE
 * CAMERA IT IS NOT WORING".
 *
 * The camera takes over the whole iPad screen, and while it is up, a React
 * re-render can replace the <input> that is waiting for the photo. These tests
 * pin the two properties that stop that:
 *
 *   1. the input lives in the document, not in React's tree
 *   2. the camera button carries capture="environment", so it goes STRAIGHT to
 *      the camera instead of the three-way iOS sheet
 */

/** Put a file into an input the way a picker would. */
function deliver(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.onchange?.(new Event('change') as any);
}

const lastInput = () =>
  Array.from(document.querySelectorAll('input[type=file]')).pop() as HTMLInputElement;

describe('opening a picker', () => {
  it('puts the input in the document, out of React\'s reach', () => {
    openFilePicker({ accept: 'image/*' }, () => {});
    const input = lastInput();
    expect(input).toBeTruthy();
    // In the document is the whole point: a detached node, and the handler with
    // it, can be collected while the camera is up.
    expect(document.body.contains(input)).toBe(true);
  });

  it('asks for the rear camera, so iOS skips the Library/Camera sheet', () => {
    openCamera(() => {});
    expect(lastInput().getAttribute('capture')).toBe('environment');
  });

  it('asks for no camera at all when the person wants the gallery', () => {
    openGallery(() => {});
    expect(lastInput().hasAttribute('capture')).toBe(false);
  });

  it('hands over the chosen file and then tidies itself away', () => {
    const onFile = vi.fn();
    openCamera(onFile);
    const input = lastInput();
    const photo = new File(['x'], 'IMG_0421.HEIC', { type: 'image/heic' });

    deliver(input, [photo]);

    expect(onFile).toHaveBeenCalledWith(photo);
    // Left behind, these would pile up one per photo for a whole planning session.
    expect(document.body.contains(input)).toBe(false);
  });

  it('says nothing when the person cancels', () => {
    const onFile = vi.fn();
    openCamera(onFile);
    deliver(lastInput(), []);
    expect(onFile).not.toHaveBeenCalled();
  });
});
