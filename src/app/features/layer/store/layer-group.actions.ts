import { createAction } from '@ngrx/store';
import { Update } from '@ngrx/entity';
import { LayerGroup } from '../layer-group.model';
import { PersistentActionMeta } from '../../../op-log/core/persistent-action.interface';
import { OpType } from '../../../op-log/core/operation.types';

// Single-entity ops only. Grouping N layers is one addLayerGroup plus N
// independent updateLayer ops (the app's bulk pattern), never one
// multi-entity action.

export const addLayerGroup = createAction(
  '[LayerGroup] Add LayerGroup',
  (payload: { layerGroup: LayerGroup }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER_GROUP',
      entityId: payload.layerGroup.id,
      opType: OpType.Create,
    } satisfies PersistentActionMeta,
  }),
);

export const updateLayerGroup = createAction(
  '[LayerGroup] Update LayerGroup',
  (payload: { layerGroup: Update<LayerGroup> }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER_GROUP',
      entityId: payload.layerGroup.id as string,
      opType: OpType.Update,
    } satisfies PersistentActionMeta,
  }),
);

export const deleteLayerGroup = createAction(
  '[LayerGroup] Delete LayerGroup',
  (payload: { id: string }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER_GROUP',
      entityId: payload.id,
      opType: OpType.Delete,
    } satisfies PersistentActionMeta,
  }),
);
