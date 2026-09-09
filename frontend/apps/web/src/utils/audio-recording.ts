/**
 * Picking a recording format the browser will actually accept.
 *
 * Ali, 2026-09-09 (iPad): "RECORD VOICE IS NOT RECORDEING".
 *
 * THE BUG THIS EXISTS TO KILL
 * ===========================
 *
 * Three places in this app called:
 *
 *     new MediaRecorder(stream, { mimeType: 'audio/webm' })
 *
 * Safari does not record webm. It never has. That constructor does not return
 * a recorder that stays quiet — it THROWS NotSupportedError, before the
 * microphone is ever used. Every one of those three call sites caught the throw
 * and reported it as "no microphone", which is why this looked like a hardware
 * problem for months instead of a one-word format problem.
 *
 * So voice was dead on every iPad and iPhone using the WEB app: the planner's
 * new job notes, the inspector's voice answers, and every VoiceTextArea.
 *
 * WHY WEBM STAYS FIRST IN THE LIST
 * ================================
 *
 * Chrome and Android record webm today and the backend, the transcription and
 * the stored files are all proven on it. Putting webm first means those
 * browsers produce a byte-identical file to yesterday's. Only Safari — which
 * produced NOTHING — changes behaviour. A fix that also rewrites the working
 * case is a bigger bet than the bug deserves.
 *
 * The server already handles the Safari result: 'm4a' is in file_service's
 * ALLOWED_EXTENSIONS, Cloudinary stores it, and app/api/voice.py takes the
 * extension from the real filename rather than assuming webm.
 */

export interface AudioFormat {
  /** Passed to MediaRecorder and used as the Blob type. */
  mimeType: string;
  /** File extension the server should see. It routes storage and transcription. */
  extension: string;
}

/**
 * Best first. Safari (iPad/iPhone/Mac) only answers to the mp4 line.
 */
const CANDIDATES: AudioFormat[] = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4', extension: 'm4a' },   // Safari
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mimeType: 'audio/ogg', extension: 'ogg' },
];

/** Older Safari has MediaRecorder but not isTypeSupported. */
const supports = (mimeType: string): boolean => {
  const Recorder = (window as any).MediaRecorder;
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return false;
  try {
    return Recorder.isTypeSupported(mimeType);
  } catch {
    return false;
  }
};

export const pickAudioFormat = (): AudioFormat | null =>
  CANDIDATES.find((candidate) => supports(candidate.mimeType)) ?? null;

/**
 * A MediaRecorder plus the format it settled on.
 *
 * When nothing in the list is supported we construct with NO options at all
 * and let the browser choose. Passing `{ mimeType: '' }` throws — an empty
 * string is not "no preference", it is an unsupported format.
 */
export const createRecorder = (
  stream: MediaStream,
): { recorder: MediaRecorder; format: AudioFormat } => {
  const chosen = pickAudioFormat();
  if (chosen) {
    return { recorder: new MediaRecorder(stream, { mimeType: chosen.mimeType }), format: chosen };
  }

  const recorder = new MediaRecorder(stream);
  // Whatever it picked, believe it rather than the list.
  const actual = recorder.mimeType || 'audio/webm';
  const extension = actual.includes('mp4') || actual.includes('mpeg')
    ? 'm4a'
    : actual.includes('ogg')
      ? 'ogg'
      : 'webm';
  return { recorder, format: { mimeType: actual, extension } };
};

/**
 * Say what actually went wrong.
 *
 * "No microphone available" sent Ali looking at the iPad's hardware. A refused
 * permission and a missing microphone need completely different actions from
 * the person holding the tablet, so they must not share a sentence.
 */
export const describeMicError = (err: unknown): string => {
  const name = (err as any)?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone blocked. Allow it for this site: aA in the address bar → Website Settings → Microphone.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone found on this device.';
    case 'NotReadableError':
      return 'The microphone is busy in another app. Close it and try again.';
    case 'NotSupportedError':
      return 'This browser cannot record audio. Try Safari or Chrome, updated.';
    default:
      return (err as any)?.message
        ? `Could not start recording: ${(err as any).message}`
        : 'Could not start recording.';
  }
};

/**
 * The i18n key for the same reason.
 *
 * An inspector who cannot record needs to be TOLD WHY IN HIS OWN LANGUAGE. The
 * line this replaced on the checklist page was translated; a more precise
 * English sentence would have been a step backwards for an Arabic crew.
 *
 * Pair it with describeMicError as the fallback:
 *
 *     message.error(t(micErrorKey(err), describeMicError(err)))
 */
export const micErrorKey = (err: unknown): string => {
  switch ((err as any)?.name || '') {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'voice.mic_blocked';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'voice.mic_not_found';
    case 'NotReadableError':
      return 'voice.mic_busy';
    case 'NotSupportedError':
      return 'voice.mic_unsupported';
    default:
      return 'voice.mic_failed';
  }
};
