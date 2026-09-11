import { describe, it, expect, afterEach } from 'vitest';
import { pickAudioFormat, createRecorder, describeMicError, playableAudioUrl } from './audio-recording';

/**
 * Ali's bug, 2026-09-09 (iPad): "RECORD VOICE IS NOT RECORDEING".
 *
 * Chrome cannot prove this fix — Chrome records webm and always did. So these
 * tests stand in for the browsers by answering isTypeSupported exactly the way
 * each one does, and check that the format we pick is one that browser accepts.
 *
 * The old code passed a hard-coded 'audio/webm' to a constructor that THROWS on
 * Safari, so the last test here is the bug itself, stated as a rule.
 */

const realRecorder = (globalThis as any).MediaRecorder;

/** A browser that supports exactly `supported`, and throws on anything else. */
function browserSupporting(supported: string[]) {
  class FakeRecorder {
    mimeType: string;
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      const wanted = options?.mimeType;
      if (wanted !== undefined && !supported.includes(wanted)) {
        const err = new Error(`${wanted} is not supported`);
        err.name = 'NotSupportedError';
        throw err;
      }
      this.mimeType = wanted ?? supported[0] ?? '';
    }
    static isTypeSupported(type: string) {
      return supported.includes(type);
    }
  }
  (globalThis as any).MediaRecorder = FakeRecorder;
  (globalThis as any).window = globalThis;
}

afterEach(() => {
  (globalThis as any).MediaRecorder = realRecorder;
});

// What each browser actually answers.
const CHROME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const SAFARI = ['audio/mp4'];

describe('picking a recording format', () => {
  it('gives Safari the one format it records', () => {
    browserSupporting(SAFARI);
    expect(pickAudioFormat()).toEqual({ mimeType: 'audio/mp4', extension: 'm4a' });
  });

  it('leaves Chrome on webm, so nothing that already worked moves', () => {
    browserSupporting(CHROME);
    expect(pickAudioFormat()?.extension).toBe('webm');
  });

  it('falls back to the browser default rather than throwing', () => {
    // An old Safari: MediaRecorder exists, isTypeSupported does not.
    class Bare {
      mimeType = 'audio/mp4';
      constructor(_s: unknown, options?: { mimeType?: string }) {
        if (options) throw new Error('no options accepted');
      }
    }
    (globalThis as any).MediaRecorder = Bare;
    (globalThis as any).window = globalThis;

    expect(pickAudioFormat()).toBeNull();
    const { format } = createRecorder({} as MediaStream);
    expect(format.extension).toBe('m4a');   // read back off the recorder itself
  });
});

describe('constructing the recorder', () => {
  it('does not throw on Safari — THE BUG', () => {
    browserSupporting(SAFARI);
    // The old line was: new MediaRecorder(stream, { mimeType: 'audio/webm' })
    expect(() => new (globalThis as any).MediaRecorder({}, { mimeType: 'audio/webm' }))
      .toThrow();
    // The new one must not.
    expect(() => createRecorder({} as MediaStream)).not.toThrow();
  });

  it('names the file with the extension the recording really is', () => {
    browserSupporting(SAFARI);
    const { format } = createRecorder({} as MediaStream);
    // The server picks storage and transcription from this extension, so a
    // Safari recording called .webm would be labelled as something it is not.
    expect(`note.${format.extension}`).toBe('note.m4a');
  });
});

describe('the url a recording is played from', () => {
  it('asks Cloudinary to re-encode, which is what gives it a LENGTH', () => {
    // Ali, 2026-09-11: "it plays, but it keeps showing the load sign and
    // details keeps --:--". A browser writes the length field at the TOP of the
    // file, before it knows when the speaking will stop, so it stays unknown.
    expect(playableAudioUrl('https://res.cloudinary.com/demo/video/upload/v1/note.webm'))
      .toBe('https://res.cloudinary.com/demo/video/upload/f_mp3/v1/note.webm');
  });

  it('does not ask twice', () => {
    const already = 'https://res.cloudinary.com/demo/video/upload/f_mp3/v1/note.webm';
    expect(playableAudioUrl(already)).toBe(already);
  });

  it('leaves a url it does not recognise alone', () => {
    expect(playableAudioUrl('https://example.com/note.webm'))
      .toBe('https://example.com/note.webm');
  });

  it('survives nothing at all', () => {
    expect(playableAudioUrl(null)).toBeUndefined();
    expect(playableAudioUrl(undefined)).toBeUndefined();
  });
});

describe('telling the person what went wrong', () => {
  it('separates a blocked microphone from a missing one', () => {
    const blocked = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const missing = Object.assign(new Error('none'), { name: 'NotFoundError' });
    expect(describeMicError(blocked)).toMatch(/blocked/i);
    expect(describeMicError(missing)).toMatch(/No microphone found/i);
    expect(describeMicError(blocked)).not.toBe(describeMicError(missing));
  });
});
