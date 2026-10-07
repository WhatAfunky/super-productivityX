import { createFeatureSelector, createSelector } from '@ngrx/store';
import { LayerLabel, LayerLabelState } from '../layer-label.model';
import { LAYER_LABEL_FEATURE_NAME, selectAll } from './layer-label.reducer';
import { resolveLayerLabel } from '../layer-label.util';

export const selectLayerLabelFeatureState = createFeatureSelector<LayerLabelState>(
  LAYER_LABEL_FEATURE_NAME,
);

export const selectAllLayerLabels = createSelector(
  selectLayerLabelFeatureState,
  selectAll,
);

export const selectLayerLabelEntities = createSelector(
  selectLayerLabelFeatureState,
  (state) => state.entities,
);

export const selectLayerLabelById = createSelector(
  selectLayerLabelFeatureState,
  (state: LayerLabelState, props: { id: string }): LayerLabel | undefined =>
    state.entities[props.id],
);

/**
 * projectId → that project's *visible* labels, sorted by name. Visible means
 * the label resolves to itself: not merged into another label (a merge cycle
 * from concurrent edits keeps both visible). A Map so a crafted projectId
 * can't poison Object.prototype.
 */
export const selectVisibleLayerLabelsByProjectIdMap = createSelector(
  selectAllLayerLabels,
  selectLayerLabelEntities,
  (labels, entities): Map<string, LayerLabel[]> => {
    const map = new Map<string, LayerLabel[]>();
    for (const label of labels) {
      if (resolveLayerLabel(label.id, entities)?.id !== label.id) continue;
      const arr = map.get(label.projectId);
      if (arr) {
        arr.push(label);
      } else {
        map.set(label.projectId, [label]);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  },
);
