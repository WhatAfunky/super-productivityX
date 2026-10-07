import { createReducer, on } from '@ngrx/store';
import { createEntityAdapter, EntityAdapter } from '@ngrx/entity';
import * as LayerLabelActions from './layer-label.actions';
import { LayerLabel, LayerLabelState } from '../layer-label.model';
import { sanitizeLayerLabelColor, sanitizeLayerLabelName } from '../layer-label.util';
import { loadAllData } from '../../../root-store/meta/load-all-data.action';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';

export const LAYER_LABEL_FEATURE_NAME = 'layerLabel';

export const adapter: EntityAdapter<LayerLabel> = createEntityAdapter<LayerLabel>();

export const initialLayerLabelState: LayerLabelState = adapter.getInitialState();

/** Fields an update may never change. */
const IMMUTABLE_FIELDS: readonly (keyof LayerLabel)[] = ['id', 'projectId'];

export const layerLabelReducer = createReducer(
  initialLayerLabelState,

  on(LayerLabelActions.addLayerLabel, (state, { layerLabel }) =>
    adapter.addOne(
      {
        ...layerLabel,
        name: sanitizeLayerLabelName(layerLabel.name),
        color: sanitizeLayerLabelColor(layerLabel.color),
      },
      state,
    ),
  ),

  on(LayerLabelActions.updateLayerLabel, (state, { layerLabel }) => {
    const changes: Partial<LayerLabel> = { ...layerLabel.changes };
    for (const field of IMMUTABLE_FIELDS) {
      delete changes[field];
    }
    // Sanitize whenever the key is present, so a malformed peer value can't
    // bypass the caps.
    if (Object.hasOwn(changes, 'name')) {
      changes.name = sanitizeLayerLabelName(changes.name);
    }
    if (Object.hasOwn(changes, 'color')) {
      changes.color = sanitizeLayerLabelColor(changes.color);
    }
    // A label can't be merged into itself.
    if (changes.mergedIntoId && changes.mergedIntoId === layerLabel.id) {
      delete changes.mergedIntoId;
    }
    return adapter.updateOne({ ...layerLabel, changes }, state);
  }),

  on(LayerLabelActions.deleteLayerLabel, (state, { id }) => adapter.removeOne(id, state)),

  // A project's labels go with it, in the same op as the project delete.
  on(TaskSharedActions.deleteProject, (state, { projectId }) => {
    const ids = (state.ids as string[]).filter(
      (id) => state.entities[id]?.projectId === projectId,
    );
    return ids.length ? adapter.removeMany(ids, state) : state;
  }),

  on(loadAllData, (_state, { appDataComplete }) =>
    // Data written before labels existed has no `layerLabel` slice: start empty.
    appDataComplete.layerLabel
      ? (appDataComplete.layerLabel as LayerLabelState)
      : initialLayerLabelState,
  ),
);

export const { selectIds, selectEntities, selectAll, selectTotal } =
  adapter.getSelectors();
