import {
  createLayerImageId,
  getImageFromDataTransfer,
  isValidLayerImageId,
  MAX_LAYER_TITLE_LENGTH,
  sanitizeLayerTitle,
} from './layer.util';

describe('layer.util', () => {
  describe('sanitizeLayerTitle', () => {
    it('trims and caps', () => {
      expect(sanitizeLayerTitle('  hi  ')).toBe('hi');
      expect(sanitizeLayerTitle('x'.repeat(MAX_LAYER_TITLE_LENGTH + 1)).length).toBe(
        MAX_LAYER_TITLE_LENGTH,
      );
    });

    it('returns an empty string for non-strings', () => {
      expect(sanitizeLayerTitle(null)).toBe('');
      expect(sanitizeLayerTitle(undefined)).toBe('');
      expect(sanitizeLayerTitle({ toString: () => 'evil' })).toBe('');
    });
  });

  describe('isValidLayerImageId', () => {
    it('accepts ids this feature creates', () => {
      expect(isValidLayerImageId(createLayerImageId('V1StGXR8_Z5jdHi6B-myT'))).toBe(true);
    });

    it('rejects anything that could escape the image folder or is foreign', () => {
      for (const bad of [
        '../../etc/passwd',
        'layer-../x',
        'layer-a/b',
        'layer-a\\b',
        'clip-123-abc',
        'layer-',
        'layer-' + 'a'.repeat(65),
        '',
        null,
        undefined,
        42,
      ]) {
        expect(isValidLayerImageId(bad)).withContext(String(bad)).toBe(false);
      }
    });
  });

  describe('getImageFromDataTransfer', () => {
    const transferWith = (files: File[]): DataTransfer => {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      return dt;
    };

    it('returns the first image', () => {
      const text = new File(['a'], 'a.txt', { type: 'text/plain' });
      const png = new File(['b'], 'b.png', { type: 'image/png' });
      expect(getImageFromDataTransfer(transferWith([text, png]))?.name).toBe('b.png');
    });

    it('returns null without an image or data', () => {
      const text = new File(['a'], 'a.txt', { type: 'text/plain' });
      expect(getImageFromDataTransfer(transferWith([text]))).toBeNull();
      expect(getImageFromDataTransfer(null)).toBeNull();
    });
  });
});
