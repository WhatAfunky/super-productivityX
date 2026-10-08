import { LayerGroup, MAX_LAYER_GROUP_DEPTH } from './layer-group.model';

export const MAX_LAYER_GROUP_NAME_LENGTH = 80;

export const sanitizeLayerGroupName = (name: unknown): string =>
  typeof name === 'string' ? name.trim().slice(0, MAX_LAYER_GROUP_NAME_LENGTH) : '';

/** Anything ordered among siblings: a layer or a group. */
export interface Orderable {
  createdAt: number;
  sortKey?: string | null;
}

/**
 * Sibling order: manual keys ascending; items without a key (never dragged,
 * or arrived from elsewhere) come first, newest first, so a new layer always
 * shows on top.
 */
export const compareSiblings = (a: Orderable, b: Orderable): number => {
  const ka = a.sortKey || '';
  const kb = b.sortKey || '';
  if (!ka && !kb) return b.createdAt - a.createdAt;
  if (!ka) return -1;
  if (!kb) return 1;
  return ka < kb ? -1 : ka > kb ? 1 : b.createdAt - a.createdAt;
};

/**
 * Resolved structure of a project's groups: each group's effective parent
 * (missing/foreign/cyclic parents → top level), depth (1 = top level) and the
 * folder it lives in (its top-level ancestor's folder).
 */
export interface GroupIndex {
  byId: Map<string, LayerGroup>;
  parentOf: Map<string, string | null>;
  depthOf: Map<string, number>;
  folderOf: Map<string, string | null>;
  childGroupsOf: Map<string | null, LayerGroup[]>;
}

export const buildGroupIndex = (groups: readonly LayerGroup[]): GroupIndex => {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const parentOf = new Map<string, string | null>();
  for (const g of groups) {
    const p = g.parentGroupId;
    parentOf.set(g.id, p && p !== g.id && byId.has(p) ? p : null);
  }
  // Break cycles (possible only via concurrent edits): a group whose chain
  // returns to itself becomes top level.
  for (const g of groups) {
    const seen = new Set<string>([g.id]);
    let cur = parentOf.get(g.id) ?? null;
    while (cur) {
      if (seen.has(cur)) {
        parentOf.set(g.id, null);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }
  const depthOf = new Map<string, number>();
  const folderOf = new Map<string, string | null>();
  const resolve = (id: string): void => {
    if (depthOf.has(id)) return;
    const parent = parentOf.get(id) ?? null;
    if (parent) {
      resolve(parent);
      depthOf.set(id, depthOf.get(parent)! + 1);
      folderOf.set(id, folderOf.get(parent) ?? null);
    } else {
      depthOf.set(id, 1);
      folderOf.set(id, byId.get(id)?.sectionId ?? null);
    }
  };
  groups.forEach((g) => resolve(g.id));
  const childGroupsOf = new Map<string | null, LayerGroup[]>();
  for (const g of groups) {
    const p = parentOf.get(g.id) ?? null;
    const arr = childGroupsOf.get(p);
    if (arr) {
      arr.push(g);
    } else {
      childGroupsOf.set(p, [g]);
    }
  }
  return { byId, parentOf, depthOf, folderOf, childGroupsOf };
};

/** How many group levels hang below (and including) `groupId`. */
export const groupHeight = (groupId: string, index: GroupIndex): number => {
  const children = index.childGroupsOf.get(groupId) ?? [];
  return 1 + Math.max(0, ...children.map((c) => groupHeight(c.id, index)));
};

/**
 * Can these items (layers and/or groups, all siblings under `parentId`) be
 * wrapped in a new group without exceeding MAX_LAYER_GROUP_DEPTH?
 */
export const canGroupUnder = (
  parentId: string | null,
  selectedGroupIds: readonly string[],
  index: GroupIndex,
): boolean => {
  const newDepth = parentId ? (index.depthOf.get(parentId) ?? 1) + 1 : 1;
  const tallest = Math.max(0, ...selectedGroupIds.map((id) => groupHeight(id, index)));
  return newDepth + tallest <= MAX_LAYER_GROUP_DEPTH;
};

export type TreeNode<R> =
  | { kind: 'layer'; row: R; key: string }
  | {
      kind: 'group';
      group: LayerGroup;
      depth: number;
      key: string;
      children: TreeNode<R>[];
      /** Layers inside, at any depth. */
      layerCount: number;
    };

/**
 * One folder's content as a tree: groups and layers ordered among their
 * siblings. A grouped layer goes where its group is (its group decides the
 * folder); a layer whose group is gone sits at the folder's top level.
 */
export const buildFolderTree = <
  R extends { layer: Orderable & { id: string; groupId?: string | null } },
>(
  rows: readonly R[],
  groupsInFolder: readonly LayerGroup[],
  index: GroupIndex,
): TreeNode<R>[] => {
  const inFolder = new Set(groupsInFolder.map((g) => g.id));
  const rowsByGroup = new Map<string | null, R[]>();
  for (const row of rows) {
    const g =
      row.layer.groupId && inFolder.has(row.layer.groupId) ? row.layer.groupId : null;
    const arr = rowsByGroup.get(g);
    if (arr) {
      arr.push(row);
    } else {
      rowsByGroup.set(g, [row]);
    }
  }

  const build = (parentId: string | null): TreeNode<R>[] => {
    const groupNodes = (index.childGroupsOf.get(parentId) ?? [])
      .filter((g) => inFolder.has(g.id))
      .map((group): TreeNode<R> => {
        const children = build(group.id);
        return {
          kind: 'group',
          group,
          depth: index.depthOf.get(group.id) ?? 1,
          key: `g:${group.id}`,
          children,
          layerCount: children.reduce(
            (n, c) => n + (c.kind === 'layer' ? 1 : c.layerCount),
            0,
          ),
        };
      });
    const layerNodes = (rowsByGroup.get(parentId) ?? []).map(
      (row): TreeNode<R> => ({ kind: 'layer', row, key: `l:${row.layer.id}` }),
    );
    const orderOf = (n: TreeNode<R>): Orderable =>
      n.kind === 'layer' ? n.row.layer : n.group;
    return [...groupNodes, ...layerNodes].sort((a, b) =>
      compareSiblings(orderOf(a), orderOf(b)),
    );
  };
  return build(null);
};
