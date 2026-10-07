import { createAction } from '@ngrx/store';
import { Update } from '@ngrx/entity';
import { LayerLabel } from '../layer-label.model';
import { PersistentActionMeta } from '../../../op-log/core/persistent-action.interface';
import { OpType } from '../../../op-log/core/operation.types';

// Every label intent is one single-entity op. Rename, recolour and merge
// (setting `mergedIntoId`) are updates; none of them touch layers.

export const addLayerLabel = createAction(
  '[LayerLabel] Add LayerLabel',
  (payload: { layerLabel: LayerLabel }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER_LABEL',
      entityId: payload.layerLabel.id,
      opType: OpType.Create,
    } satisfies PersistentActionMeta,
  }),
);

export const updateLayerLabel = createAction(
  '[LayerLabel] Update LayerLabel',
  (payload: { layerLabel: Update<LayerLabel> }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER_LABEL',
      entityId: payload.layerLabel.id as string,
      opType: OpType.Update,
    } satisfies PersistentActionMeta,
  }),
);

export const deleteLayerLabel = createAction(
  '[LayerLabel] Delete LayerLabel',
  (payload: { id: string }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER_LABEL',
      entityId: payload.id,
      opType: OpType.Delete,
    } satisfies PersistentActionMeta,
  }),
);
