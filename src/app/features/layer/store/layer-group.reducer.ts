import { createReducer, on } from '@ngrx/store';
import { createEntityAdapter, EntityAdapter } from '@ngrx/entity';
import * as LayerGroupActions from './layer-group.actions';
import { LayerGroup, LayerGroupState } from '../layer-group.model';
import { sanitizeLayerGroupName } from '../layer-group.util';
import { loadAllData } from '../../../root-store/meta/load-all-data.action';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';

export const LAYER_GROUP_FEATURE_NAME = 'layerGroup';

export const adapter: EntityAdapter<LayerGroup> = createEntityAdapter<LayerGroup>();

export const initialLayerGroupState: LayerGroupState = adapter.getInitialState();

const IMMUTABLE_FIELDS: readonly (keyof LayerGroup)[] = ['id', 'projectId', 'createdAt'];

export const layerGroupReducer = createReducer(
  initialLayerGroupState,

  on(LayerGroupActions.addLayerGroup, (state, { layerGroup }) =>
    adapter.addOne(
      { ...layerGroup, name: sanitizeLayerGroupName(layerGroup.name) },
      state,
    ),
  ),

  on(LayerGroupActions.updateLayerGroup, (state, { layerGroup }) => {
    const changes: Partial<LayerGroup> = { ...layerGroup.changes };
    for (const field of IMMUTABLE_FIELDS) {
      delete changes[field];
    }
    if (Object.hasOwn(changes, 'name')) {
      changes.name = sanitizeLayerGroupName(changes.name);
    }
    // A group can't be its own parent (cycles across groups are resolved on read).
    if (changes.parentGroupId && changes.parentGroupId === layerGroup.id) {
      delete changes.parentGroupId;
    }
    return adapter.updateOne({ ...layerGroup, changes }, state);
  }),

  on(LayerGroupActions.deleteLayerGroup, (state, { id }) => adapter.removeOne(id, state)),

  // A project's groups go with it, in the same op as the project delete.
  on(TaskSharedActions.deleteProject, (state, { projectId }) => {
    const ids = (state.ids as string[]).filter(
      (id) => state.entities[id]?.projectId === projectId,
    );
    return ids.length ? adapter.removeMany(ids, state) : state;
  }),

  on(loadAllData, (_state, { appDataComplete }) =>
    appDataComplete.layerGroup
      ? (appDataComplete.layerGroup as LayerGroupState)
      : initialLayerGroupState,
  ),
);

export const { selectIds, selectEntities, selectAll, selectTotal } =
  adapter.getSelectors();
