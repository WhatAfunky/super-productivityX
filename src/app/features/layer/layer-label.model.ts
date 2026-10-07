import { EntityState } from '@ngrx/entity';

/**
 * A per-project label for layers (e.g. CODE, ART, SFX), shown as a coloured
 * strip and pill. A layer points at one label via `layer.labelId`; labels never
 * list their layers.
 *
 * Merging "Sound" into "SFX" sets `Sound.mergedIntoId = SFX.id` instead of
 * rewriting every layer, so a merge is one single-entity op. Reads resolve a
 * label through that chain (see `resolveLayerLabel`).
 */
export interface LayerLabel {
  id: string;
  projectId: string;
  name: string;
  /** A key of LAYER_LABEL_PALETTE, not a free colour. */
  color: string;
  mergedIntoId?: string | null;
}

export type LayerLabelState = EntityState<LayerLabel>;
