/**
 * Auto screenshots (v3.3): capturing one user-chosen app window.
 *
 * Security: the main window's renderer is not trusted with other apps' pixels
 * (plugins run there). Window thumbnails are only shown in the main-process
 * owned picker window, and a capture is only done for a window the user picked
 * there (a "grant"), re-found later by id or title.
 */
export interface CaptureTarget {
  /** desktopCapturer source id, e.g. "window:12345:0" (changes when the app restarts). */
  id: string;
  /** Window title at the time it was picked or last captured. */
  title: string;
}

export type CapturePermission = 'granted' | 'denied' | 'not-determined' | 'unknown';

export type CaptureResult =
  | { ok: true; png: Uint8Array; target: CaptureTarget }
  | { ok: false; reason: 'permission' | 'not-found' | 'not-granted' | 'error' };

/** Translated strings for the picker window (it has no i18n of its own). */
export interface CapturePickerLabels {
  title: string;
  hint: string;
  refresh: string;
  cancel: string;
  use: string;
  empty: string;
  permission: string;
  openSettings: string;
}

/** A window as the picker shows it. */
export interface CapturePickerSource {
  id: string;
  title: string;
  /** data:image/png thumbnail. */
  thumbnail: string;
}

/**
 * The comparable part of a window title: the document part before app
 * decorations like " @ 33%", " — Photoshop", " - Blender" or " (modified)".
 */
export const captureTitleKey = (title: string): string =>
  title
    .split(/ @ | — | – | - | \(|\*$/)[0]
    .replace(/[*•]\s*$/, '')
    .trim()
    .toLowerCase();

/**
 * Finds the target window among the open ones: by id, else by exact title,
 * else by the title's document part when exactly one window matches.
 */
export const findCaptureSource = <S extends { id: string; name: string }>(
  sources: readonly S[],
  target: CaptureTarget,
): S | null => {
  const byId = sources.find((s) => s.id === target.id);
  if (byId) return byId;
  const byTitle = sources.filter((s) => s.name === target.title);
  if (byTitle.length === 1) return byTitle[0];
  const key = captureTitleKey(target.title);
  if (key.length < 3) return null;
  const byKey = sources.filter((s) => captureTitleKey(s.name) === key);
  return byKey.length === 1 ? byKey[0] : null;
};

/** Whether a capture request is for a window the user picked. */
export const isGrantedCaptureTarget = (
  grants: readonly CaptureTarget[],
  target: unknown,
): target is CaptureTarget => {
  if (!target || typeof target !== 'object') return false;
  const { id, title } = target as Partial<CaptureTarget>;
  if (typeof id !== 'string' || typeof title !== 'string') return false;
  return grants.some((g) => g.id === id || g.title === title);
};
