import {
  CAPTURE_WARN_STEP_BYTES,
  captureWarnLevel,
  capturesToThinOut,
  createCaptureId,
  formatBytes,
  isCaptureId,
  parseCaptureId,
} from './layer-capture.util';
import { isValidLayerImageId } from './layer.util';

describe('layer-capture.util', () => {
  it('capture ids round-trip and are valid layer image ids', () => {
    const id = createCaptureId('V1StGXR8_Z5jdHi6B-myT', 1792700000000);
    expect(isValidLayerImageId(id)).toBe(true);
    expect(isCaptureId(id)).toBe(true);
    expect(parseCaptureId(id)).toEqual({
      layerId: 'V1StGXR8_Z5jdHi6B-myT',
      takenAt: 1792700000000,
    });
    expect(isCaptureId(id + '-thumb')).toBe(false);
    expect(isCaptureId('layer-abc')).toBe(false);
    expect(parseCaptureId('layer-cap-../x-1')).toBeNull();
  });

  it('thinning keeps the last 7 days, then one per hour, then one per day', () => {
    const H = 3600_000;
    const D = 24 * H;
    const now = new Date(2026, 9, 22, 12).getTime();
    const at = (ms: number, id: string): { id: string; takenAt: number } => ({
      id,
      takenAt: now - ms,
    });
    const MIN5 = 5 * 60_000;
    const DAY1 = D;
    const DAY10 = 10 * D;
    const DAY40 = 40 * D;
    const H2 = 2 * H;
    const H3 = 3 * H;
    const H4 = 4 * H;
    const caps = [
      at(DAY1, 'recent-a'),
      at(DAY1 + MIN5, 'recent-b'),
      at(DAY10, 'h1-first'),
      at(DAY10 - MIN5, 'h1-second'),
      at(DAY10 - H2, 'h2'),
      at(DAY40, 'd1-first'),
      at(DAY40 - H3, 'd1-later'),
      at(DAY40 - H4, 'kept-screenshot'),
    ];
    const drop = capturesToThinOut(caps, now, new Set(['kept-screenshot']));
    expect(drop.sort()).toEqual(['d1-later', 'h1-second'].sort());
  });

  it('warn levels step every 100 MB', () => {
    expect(captureWarnLevel(0)).toBe(0);
    expect(captureWarnLevel(CAPTURE_WARN_STEP_BYTES - 1)).toBe(0);
    expect(captureWarnLevel(CAPTURE_WARN_STEP_BYTES * 2.5)).toBe(
      CAPTURE_WARN_STEP_BYTES * 2,
    );
  });

  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
    expect(formatBytes(104 * 1024 * 1024)).toBe('104 MB');
  });
});
