import { createReducer, on } from '@ngrx/store';
import { createEntityAdapter, EntityAdapter } from '@ngrx/entity';
import * as LayerActions from './layer.actions';
import { Layer, LayerState } from '../layer.model';
import { sanitizeLayerTitle } from '../layer.util';
import { loadAllData } from '../../../root-store/meta/load-all-data.action';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';

export const LAYER_FEATURE_NAME = 'layer';

export const adapter: EntityAdapter<Layer> = createEntityAdapter<Layer>();

export const initialLayerState: LayerState = adapter.getInitialState();

/** Fields an update may never change: identity, ownership and creation time. */
const IMMUTABLE_FIELDS: readonly (keyof Layer)[] = ['id', 'projectId', 'createdAt'];

export const layerReducer = createReducer(
  initialLayerState,

  on(LayerActions.addLayer, (state, { layer }) =>
    adapter.addOne({ ...layer, title: sanitizeLayerTitle(layer.title) }, state),
  ),

  on(LayerActions.updateLayer, (state, { layer }) => {
    const changes: Partial<Layer> = { ...layer.changes };
    for (const field of IMMUTABLE_FIELDS) {
      delete changes[field];
    }
    // Sanitize whenever the key is present (whatever its value) so a
    // malformed peer's `{ title: null }` cannot bypass the cap.
    if (Object.hasOwn(changes, 'title')) {
      changes.title = sanitizeLayerTitle(changes.title);
    }
    return adapter.updateOne({ ...layer, changes }, state);
  }),

  on(LayerActions.deleteLayer, (state, { id }) => adapter.removeOne(id, state)),

  // A project's layers go with it, in the same op as the project delete.
  on(TaskSharedActions.deleteProject, (state, { projectId }) => {
    const ids = (state.ids as string[]).filter(
      (id) => state.entities[id]?.projectId === projectId,
    );
    return ids.length ? adapter.removeMany(ids, state) : state;
  }),

  on(loadAllData, (_state, { appDataComplete }) =>
    // Full state replacement (hydration, SYNC_IMPORT, BACKUP_IMPORT). Data
    // written before layers existed has no `layer` slice: start empty.
    appDataComplete.layer ? (appDataComplete.layer as LayerState) : initialLayerState,
  ),
);

export const { selectIds, selectEntities, selectAll, selectTotal } =
  adapter.getSelectors();
