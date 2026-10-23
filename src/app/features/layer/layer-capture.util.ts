/**
 * Auto screenshots (v3.3): a layer's capture history lives in the layer image
 * store as files named `layer-cap-<layerId>-<takenAt base36>` (plus the usual
 * `-thumb`). The history is read back from the store's listing, so no index
 * is persisted, and the ids are valid layer image ids (resolvable, hidden from
 * the clipboard-images manager).
 */

const CAPTURE_PREFIX = 'layer-cap-';
const CAPTURE_ID_RE = /^layer-cap-([A-Za-z0-9_-]{1,40})-([0-9a-z]{1,12})$/;
const THUMB_SUFFIX = '-thumb';

export const CAPTURE_INTERVAL_MS = 5 * 60 * 1000;
/** Warn when a layer's history passes each multiple of this (100, 200, … MB). */
export const CAPTURE_WARN_STEP_BYTES = 100 * 1024 * 1024;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KEEP_ALL_FOR_MS = 7 * DAY;
const HOURLY_UNTIL_MS = 30 * DAY;

export interface LayerCapture {
  id: string;
  layerId: string;
  takenAt: number;
  size: number;
}

export const createCaptureId = (layerId: string, takenAt: number): string =>
  `${CAPTURE_PREFIX}${layerId}-${Math.max(0, Math.floor(takenAt)).toString(36)}`;

export const isCaptureId = (id: unknown): id is string =>
  typeof id === 'string' && !id.endsWith(THUMB_SUFFIX) && CAPTURE_ID_RE.test(id);

export const parseCaptureId = (
  id: string,
): { layerId: string; takenAt: number } | null => {
  if (id.endsWith(THUMB_SUFFIX)) return null;
  const m = CAPTURE_ID_RE.exec(id);
  if (!m) return null;
  const takenAt = parseInt(m[2], 36);
  return Number.isFinite(takenAt) ? { layerId: m[1], takenAt } : null;
};

/**
 * Captures to delete when thinning out: everything of the last 7 days stays;
 * up to 30 days, the first capture of each hour; older, the first of each day.
 * `keepIds` (e.g. the layer's current screenshot) are never deleted.
 */
export const capturesToThinOut = (
  captures: readonly Pick<LayerCapture, 'id' | 'takenAt'>[],
  now: number,
  keepIds: ReadonlySet<string> = new Set(),
): string[] => {
  const seen = new Set<string>();
  const drop: string[] = [];
  for (const c of [...captures].sort((a, b) => a.takenAt - b.takenAt)) {
    const age = now - c.takenAt;
    if (age <= KEEP_ALL_FOR_MS || keepIds.has(c.id)) continue;
    const d = new Date(c.takenAt);
    const bucket =
      age <= HOURLY_UNTIL_MS
        ? `h${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
        : `d${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (seen.has(bucket)) {
      drop.push(c.id);
    } else {
      seen.add(bucket);
    }
  }
  return drop;
};

/**
 * The warning level a history size has reached (0, 100 MB, 200 MB, …); a
 * banner shows while it is above what the user last acknowledged.
 */
export const captureWarnLevel = (bytes: number): number =>
  Math.floor(Math.max(0, bytes) / CAPTURE_WARN_STEP_BYTES) * CAPTURE_WARN_STEP_BYTES;

export const formatBytes = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
