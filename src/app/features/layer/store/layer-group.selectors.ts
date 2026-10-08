import { createFeatureSelector, createSelector } from '@ngrx/store';
import { LayerGroup, LayerGroupState } from '../layer-group.model';
import { LAYER_GROUP_FEATURE_NAME, selectAll } from './layer-group.reducer';

export const selectLayerGroupFeatureState = createFeatureSelector<LayerGroupState>(
  LAYER_GROUP_FEATURE_NAME,
);

export const selectAllLayerGroups = createSelector(
  selectLayerGroupFeatureState,
  selectAll,
);

export const selectLayerGroupById = createSelector(
  selectLayerGroupFeatureState,
  (state: LayerGroupState, props: { id: string }): LayerGroup | undefined =>
    state.entities[props.id],
);

/** projectId → that project's groups. A Map against prototype poisoning. */
export const selectLayerGroupsByProjectIdMap = createSelector(
  selectAllLayerGroups,
  (groups): Map<string, LayerGroup[]> => {
    const map = new Map<string, LayerGroup[]>();
    for (const group of groups) {
      const arr = map.get(group.projectId);
      if (arr) {
        arr.push(group);
      } else {
        map.set(group.projectId, [group]);
      }
    }
    return map;
  },
);
