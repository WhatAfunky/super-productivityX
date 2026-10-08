import { EntityState } from '@ngrx/entity';

/** Groups nest at most this deep (folder → group → group → group). */
export const MAX_LAYER_GROUP_DEPTH = 3;

/**
 * A named, collapsible bundle of layers (and groups) inside one folder, like
 * Photoshop / Clip Studio layer groups.
 *
 * Membership lives on the children (`layer.groupId`, `group.parentGroupId`);
 * a group never lists its members. A dangling parent id means "not in a
 * group", so deleting a group (ungroup) is one op and never rewrites children.
 */
export interface LayerGroup {
  id: string;
  projectId: string;
  /** The folder (project section) the group lives in. */
  sectionId?: string | null;
  /** Parent group for nesting; missing or dangling → top level of the folder. */
  parentGroupId?: string | null;
  name: string;
  createdAt: number;
  /** Manual order among its siblings (see sort-key.util); missing → by date. */
  sortKey?: string | null;
}

export type LayerGroupState = EntityState<LayerGroup>;
