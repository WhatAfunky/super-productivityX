import { Dictionary } from '@ngrx/entity';
import { LayerLabel } from './layer-label.model';
import {
  getLayerLabelColor,
  LAYER_LABEL_COLOR_KEYS,
  LAYER_LABEL_PALETTE,
  MAX_LAYER_LABEL_NAME_LENGTH,
  pickNextLayerLabelColor,
  resolveLayerLabel,
  sanitizeLayerLabelColor,
  sanitizeLayerLabelName,
} from './layer-label.util';

const label = (id: string, mergedIntoId: string | null = null): LayerLabel => ({
  id,
  projectId: 'p1',
  name: id.toUpperCase(),
  color: 'blue',
  mergedIntoId,
});

const dict = (...labels: LayerLabel[]): Dictionary<LayerLabel> =>
  Object.fromEntries(labels.map((l) => [l.id, l]));

describe('layer-label.util', () => {
  describe('resolveLayerLabel', () => {
    it('returns the label itself when not merged', () => {
      expect(resolveLayerLabel('a', dict(label('a')))?.id).toBe('a');
    });

    it('follows a merge chain to its end', () => {
      const entities = dict(label('a', 'b'), label('b', 'c'), label('c'));
      expect(resolveLayerLabel('a', entities)?.id).toBe('c');
    });

    it('returns null for no id, an unknown id, or a broken chain (deleted target)', () => {
      const entities = dict(label('a', 'gone'));
      expect(resolveLayerLabel(null, entities)).toBeNull();
      expect(resolveLayerLabel('missing', entities)).toBeNull();
      expect(resolveLayerLabel('a', entities)).toBeNull();
    });

    it('stops a merge cycle at the starting label', () => {
      const entities = dict(label('a', 'b'), label('b', 'a'));
      expect(resolveLayerLabel('a', entities)?.id).toBe('a');
      expect(resolveLayerLabel('b', entities)?.id).toBe('b');
    });
  });

  describe('colors', () => {
    it('maps keys to the palette and unknown keys to grey', () => {
      expect(getLayerLabelColor('pink')).toBe(LAYER_LABEL_PALETTE.pink);
      expect(getLayerLabelColor('nope')).toBe(LAYER_LABEL_PALETTE.grey);
      expect(getLayerLabelColor('__proto__')).toBe(LAYER_LABEL_PALETTE.grey);
      expect(sanitizeLayerLabelColor('#fff')).toBe('grey');
    });

    it('picks the first unused colour, cycling once all are used', () => {
      expect(pickNextLayerLabelColor([])).toBe(LAYER_LABEL_COLOR_KEYS[0]);
      expect(pickNextLayerLabelColor([LAYER_LABEL_COLOR_KEYS[0]])).toBe(
        LAYER_LABEL_COLOR_KEYS[1],
      );
      expect(pickNextLayerLabelColor([...LAYER_LABEL_COLOR_KEYS])).toBe(
        LAYER_LABEL_COLOR_KEYS[0],
      );
    });
  });

  it('sanitizes names', () => {
    expect(sanitizeLayerLabelName('  SFX ')).toBe('SFX');
    expect(sanitizeLayerLabelName('x'.repeat(99)).length).toBe(
      MAX_LAYER_LABEL_NAME_LENGTH,
    );
    expect(sanitizeLayerLabelName(null)).toBe('');
  });
});
