import { createAction } from '@ngrx/store';
import { Update } from '@ngrx/entity';
import { Layer } from '../layer.model';
import { PersistentActionMeta } from '../../../op-log/core/persistent-action.interface';
import { OpType } from '../../../op-log/core/operation.types';

// One user intent = one single-entity op. Nothing here touches another
// entity type: folder membership and project membership live on the layer.

export const addLayer = createAction(
  '[Layer] Add Layer',
  (payload: { layer: Layer }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER',
      entityId: payload.layer.id,
      opType: OpType.Create,
    } satisfies PersistentActionMeta,
  }),
);

export const updateLayer = createAction(
  '[Layer] Update Layer',
  (payload: { layer: Update<Layer> }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER',
      entityId: payload.layer.id as string,
      opType: OpType.Update,
    } satisfies PersistentActionMeta,
  }),
);

/**
 * Moves a layer to another project. Its own action (not `updateLayer`) so
 * `projectId` stays immutable for ordinary updates. Folder, group, order and
 * goal link belong to the old project and are cleared; `labelId` is the
 * target project's label of the same name, or null.
 */
export const moveLayerToProject = createAction(
  '[Layer] Move Layer To Project',
  (payload: { id: string; projectId: string; labelId: string | null }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER',
      entityId: payload.id,
      opType: OpType.Update,
    } satisfies PersistentActionMeta,
  }),
);

export const deleteLayer = createAction(
  '[Layer] Delete Layer',
  (payload: { id: string }) => ({
    ...payload,
    meta: {
      isPersistent: true,
      entityType: 'LAYER',
      entityId: payload.id,
      opType: OpType.Delete,
    } satisfies PersistentActionMeta,
  }),
);
