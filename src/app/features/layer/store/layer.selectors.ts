import { createFeatureSelector, createSelector } from '@ngrx/store';
import { Layer, LayerState } from '../layer.model';
import { LAYER_FEATURE_NAME, selectAll } from './layer.reducer';

export const selectLayerFeatureState =
  createFeatureSelector<LayerState>(LAYER_FEATURE_NAME);

export const selectAllLayers = createSelector(selectLayerFeatureState, selectAll);

export const selectLayerById = createSelector(
  selectLayerFeatureState,
  (state: LayerState, props: { id: string }): Layer | undefined =>
    state.entities[props.id],
);

/** Newest first; ties (same millisecond) broken by id for a stable order. */
export const compareLayersNewestFirst = (a: Layer, b: Layer): number =>
  b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Memoized map of projectId → that project's layers, newest first. A Map
 * (not a plain object) so a crafted projectId like "__proto__" from a sync
 * peer cannot poison Object.prototype.
 */
export const selectLayersByProjectIdMap = createSelector(
  selectAllLayers,
  (layers): Map<string, Layer[]> => {
    const map = new Map<string, Layer[]>();
    for (const layer of layers) {
      const arr = map.get(layer.projectId);
      if (arr) {
        arr.push(layer);
      } else {
        map.set(layer.projectId, [layer]);
      }
    }
    for (const arr of map.values()) {
      arr.sort(compareLayersNewestFirst);
    }
    return map;
  },
);
