import { Dictionary } from '@ngrx/entity';
import { LayerLabel } from './layer-label.model';

export const MAX_LAYER_LABEL_NAME_LENGTH = 40;

/**
 * The fixed label palette. Labels store the key, so the palette can be retuned
 * (e.g. muted for a theme) without touching data. Saturated fills with dark
 * text, after osu!lazer's RANKED / LOVED tags.
 */
export const LAYER_LABEL_PALETTE = {
  green: '#8bd450',
  pink: '#ff66ab',
  orange: '#ffa24c',
  blue: '#5aa9ff',
  purple: '#b57aff',
  yellow: '#ffd84d',
  teal: '#3dd6c6',
  red: '#ff6b6b',
  grey: '#9aa0a6',
  lime: '#c6e84a',
} as const;

export type LayerLabelColorKey = keyof typeof LAYER_LABEL_PALETTE;

export const LAYER_LABEL_COLOR_KEYS = Object.keys(
  LAYER_LABEL_PALETTE,
) as LayerLabelColorKey[];

const FALLBACK_COLOR_KEY: LayerLabelColorKey = 'grey';

/** Hex for a stored colour key; unknown keys (e.g. from a newer peer) → grey. */
export const getLayerLabelColor = (key: string | null | undefined): string =>
  Object.hasOwn(LAYER_LABEL_PALETTE, key ?? '')
    ? LAYER_LABEL_PALETTE[key as LayerLabelColorKey]
    : LAYER_LABEL_PALETTE[FALLBACK_COLOR_KEY];

export const sanitizeLayerLabelName = (name: unknown): string =>
  typeof name === 'string' ? name.trim().slice(0, MAX_LAYER_LABEL_NAME_LENGTH) : '';

export const sanitizeLayerLabelColor = (key: unknown): LayerLabelColorKey =>
  typeof key === 'string' && Object.hasOwn(LAYER_LABEL_PALETTE, key)
    ? (key as LayerLabelColorKey)
    : FALLBACK_COLOR_KEY;

/** The next palette colour no label of the project uses yet, cycling when full. */
export const pickNextLayerLabelColor = (
  usedKeys: readonly string[],
): LayerLabelColorKey =>
  LAYER_LABEL_COLOR_KEYS.find((k) => !usedKeys.includes(k)) ??
  LAYER_LABEL_COLOR_KEYS[usedKeys.length % LAYER_LABEL_COLOR_KEYS.length];

/**
 * The label a layer shows, following merge aliases.
 *
 * - Missing id, or any link in the chain gone (deleted) → null ("no label").
 *   Deleting a label therefore unlabels its layers, including layers of labels
 *   that had been merged into it.
 * - A cycle (two devices merging A→B and B→A concurrently) stops at the label
 *   where traversal started, so nothing disappears.
 */
export const resolveLayerLabel = (
  labelId: string | null | undefined,
  entities: Dictionary<LayerLabel>,
): LayerLabel | null => {
  if (!labelId) return null;
  const start = entities[labelId];
  if (!start) return null;
  const visited = new Set<string>([start.id]);
  let current = start;
  while (current.mergedIntoId) {
    if (visited.has(current.mergedIntoId)) return start;
    const next = entities[current.mergedIntoId];
    if (!next) return null;
    visited.add(next.id);
    current = next;
  }
  return current;
};
