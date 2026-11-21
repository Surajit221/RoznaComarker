import { messageForCode, tooLargeMessage, type SpeakingMessageLimits } from './speaking-messages';

/**
 * The backend's upload rules (audioUpload.middleware.js FORMATS), checked before a recording is sent so a student hears about a wrong file
 * at once. The server still checks everything again, including the file's content.
 */
const FORMATS: readonly { type: string; extensions: readonly string[]; mimes: readonly string[] }[] = [
  { type: 'audio/mpeg', extensions: ['.mp3'], mimes: ['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'] },
  { type: 'audio/mp4', extensions: ['.m4a', '.mp4'], mimes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'video/mp4'] },
  { type: 'audio/webm', extensions: ['.webm'], mimes: ['audio/webm', 'video/webm'] },
  { type: 'audio/ogg', extensions: ['.ogg', '.oga', '.opus'], mimes: ['audio/ogg', 'audio/opus', 'application/ogg'] },
  { type: 'audio/wav', extensions: ['.wav'], mimes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'] }
];

/** For the file input: every accepted extension and the main type of each format. */
export const RECORDING_ACCEPT = [...FORMATS.flatMap(f => f.extensions), ...FORMATS.map(f => f.type), 'audio/x-m4a'].join(',');

export type RecordingCheck = { ok: true; file: File } | { ok: false; message: string };

const refuse = (code: string): RecordingCheck => ({ ok: false, message: messageForCode(code) ?? messageForCode('AUDIO_TYPE_UNSUPPORTED')! });

/**
 * The file to send, or the fixed message that explains why not. The file sent always has a neutral name ("recording.mp3": the student's own
 * file name never leaves the browser) and, when the browser reported no type or one it does not know, the type of its extension.
 */
export function checkRecordingFile(file: File, limits: SpeakingMessageLimits = {}): RecordingCheck {
  const name = String(file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot) : '';
  const format = FORMATS.find(f => f.extensions.includes(extension));
  if (!format) return refuse('AUDIO_TYPE_UNSUPPORTED');
  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  const byMime = FORMATS.find(f => f.mimes.includes(mime));
  if (byMime && byMime !== format) return refuse('AUDIO_TYPE_MISMATCH');
  if (!file.size) return refuse('AUDIO_FILE_EMPTY');
  if (file.size > (limits.maxFileBytes ?? 40 * 1024 * 1024)) return { ok: false, message: tooLargeMessage(limits) };
  return { ok: true, file: new File([file], `recording${extension}`, { type: byMime ? file.type : format.type, lastModified: file.lastModified }) };
}
