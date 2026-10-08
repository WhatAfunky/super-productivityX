import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { nanoid } from 'nanoid';
import { firstValueFrom, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Layer } from './layer.model';
import { LayerGroup } from './layer-group.model';
import { updateLayer } from './store/layer.actions';
import {
  addLayerGroup,
  deleteLayerGroup,
  updateLayerGroup,
} from './store/layer-group.actions';
import { selectLayersByProjectIdMap } from './store/layer.selectors';
import { selectLayerGroupsByProjectIdMap } from './store/layer-group.selectors';
import { sortKeyBetween, sortKeysFor } from './sort-key.util';
import {
  buildGroupIndex,
  canGroupUnder,
  compareSiblings,
  GroupIndex,
  sanitizeLayerGroupName,
} from './layer-group.util';

const EMPTY_GROUPS: readonly LayerGroup[] = Object.freeze([]);
/** Above this length, inserting at the top re-spreads the container's keys. */
const MAX_KEY_LENGTH = 12;

/** A sibling in a container: a layer or a group. */
export type OrganizeItem =
  | { kind: 'layer'; layer: Layer }
  | { kind: 'group'; group: LayerGroup };

/** Where an item sits: a folder (or unfiled) and optionally a group in it. */
export interface Container {
  sectionId: string | null;
  groupId: string | null;
}

const sortKeyOf = (item: OrganizeItem): string | null | undefined =>
  item.kind === 'layer' ? item.layer.sortKey : item.group.sortKey;

/**
 * Groups and manual order for layers. Every change is a series of
 * single-entity ops (create group, update a layer's groupId / sortKey, ...),
 * the app's bulk pattern: each item is its own conflict unit, and a partial
 * apply leaves a valid (merely less organised) state.
 */
@Injectable({
  providedIn: 'root',
})
export class LayerOrganizeService {
  private _store = inject(Store);

  getGroupsByProjectId$(projectId: string): Observable<readonly LayerGroup[]> {
    return this._store
      .select(selectLayerGroupsByProjectIdMap)
      .pipe(map((m) => m.get(projectId) ?? EMPTY_GROUPS));
  }

  /**
   * Wraps sibling items (all in `container`) in a new group placed where the
   * topmost of them was. Returns the group id, or null when not allowed
   * (nothing selected, or the 3-level limit would be exceeded).
   */
  async group(
    projectId: string,
    container: Container,
    items: readonly OrganizeItem[],
    name: string,
  ): Promise<string | null> {
    if (!items.length) return null;
    const { index } = await this._snapshot(projectId);
    const groupIds = items.filter((i) => i.kind === 'group').map((i) => i.group.id);
    if (!canGroupUnder(container.groupId, groupIds, index)) return null;

    // The new group takes the place of the first item, in sibling order.
    const siblings = await this.getSiblings(projectId, container);
    const firstIdx = Math.min(
      ...items.map((i) => siblings.findIndex((s) => sameItem(s, i))),
    );
    const anchorKey = firstIdx >= 0 ? sortKeyOf(siblings[firstIdx]) : null;

    const id = nanoid();
    this._store.dispatch(
      addLayerGroup({
        layerGroup: {
          id,
          projectId,
          sectionId: container.sectionId,
          parentGroupId: container.groupId,
          name: sanitizeLayerGroupName(name) || 'Group',
          createdAt: Date.now(),
          sortKey: anchorKey ?? null,
        },
      }),
    );
    // Children keep their relative order; give them fresh keys inside.
    const ordered = [...items].sort((a, b) =>
      compareSiblings(orderable(a), orderable(b)),
    );
    const keys = sortKeysFor(ordered.length);
    ordered.forEach((item, i) => this._moveInto(item, container.sectionId, id, keys[i]));
    await yieldForPersistence();
    return id;
  }

  /** Children move up one level (to the group's parent); then the group goes. */
  async ungroup(group: LayerGroup): Promise<void> {
    const { index, layers, groups } = await this._snapshot(group.projectId);
    const parentId = index.parentOf.get(group.id) ?? null;
    const sectionId = index.folderOf.get(group.id) ?? null;
    for (const layer of layers.filter((l) => l.groupId === group.id)) {
      this._moveInto({ kind: 'layer', layer }, sectionId, parentId, null);
    }
    for (const child of groups.filter((g) => index.parentOf.get(g.id) === group.id)) {
      this._moveInto({ kind: 'group', group: child }, sectionId, parentId, null);
    }
    this._store.dispatch(deleteLayerGroup({ id: group.id }));
    await yieldForPersistence();
  }

  rename(groupId: string, name: string): void {
    const clean = sanitizeLayerGroupName(name);
    if (!clean) return;
    this._store.dispatch(
      updateLayerGroup({ layerGroup: { id: groupId, changes: { name: clean } } }),
    );
  }

  /**
   * Drag-and-drop within one container: puts the item at `toIndex` of the
   * container's current order. The first manual move gives every sibling a
   * key (so the order is explicit from then on); after that, a move is one
   * update of the moved item's key.
   */
  async move(
    projectId: string,
    container: Container,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (fromIndex === toIndex) return;
    let siblings = await this.getSiblings(projectId, container);
    if (fromIndex < 0 || fromIndex >= siblings.length) return;
    if (siblings.some((s) => !sortKeyOf(s))) {
      siblings = this._assignKeys(siblings);
    }
    const moved = siblings[fromIndex];
    const rest = siblings.filter((_, i) => i !== fromIndex);
    const to = Math.max(0, Math.min(toIndex, rest.length));
    const key = sortKeyBetween(
      to > 0 ? sortKeyOf(rest[to - 1]) : null,
      to < rest.length ? sortKeyOf(rest[to]) : null,
    );
    this._setKey(moved, key);
    await yieldForPersistence();
  }

  /**
   * The key a new item should get at the top of `container`: none while the
   * container is in date order (newest first anyway), else a key above the
   * first sibling. Re-spreads long keys first when needed.
   */
  async topKeyFor(projectId: string, container: Container): Promise<string | null> {
    let siblings = await this.getSiblings(projectId, container);
    if (!siblings.length || siblings.every((s) => !sortKeyOf(s))) return null;
    let key = sortKeyBetween(null, sortKeyOf(siblings[0]));
    if (key.length > MAX_KEY_LENGTH) {
      siblings = this._assignKeys(siblings);
      key = sortKeyBetween(null, sortKeyOf(siblings[0]));
    }
    return key;
  }

  /** The items directly in `container`, in display order. */
  async getSiblings(projectId: string, container: Container): Promise<OrganizeItem[]> {
    const { index, layers, groups } = await this._snapshot(projectId);
    const inContainer = (sectionId: string | null, groupId: string | null): boolean =>
      groupId === container.groupId &&
      (container.groupId !== null || sectionId === container.sectionId);
    const items: OrganizeItem[] = [
      ...groups
        .filter((g) =>
          inContainer(index.folderOf.get(g.id) ?? null, index.parentOf.get(g.id) ?? null),
        )
        .map((group): OrganizeItem => ({ kind: 'group', group })),
      ...layers
        .filter((l) => {
          const groupId = l.groupId && index.byId.has(l.groupId) ? l.groupId : null;
          return inContainer(l.sectionId ?? null, groupId);
        })
        .map((layer): OrganizeItem => ({ kind: 'layer', layer })),
    ];
    return items.sort((a, b) => compareSiblings(orderable(a), orderable(b)));
  }

  private _assignKeys(siblings: OrganizeItem[]): OrganizeItem[] {
    const keys = sortKeysFor(siblings.length);
    return siblings.map((item, i) => {
      this._setKey(item, keys[i]);
      return item.kind === 'layer'
        ? { kind: 'layer', layer: { ...item.layer, sortKey: keys[i] } }
        : { kind: 'group', group: { ...item.group, sortKey: keys[i] } };
    });
  }

  private _setKey(item: OrganizeItem, sortKey: string): void {
    if (item.kind === 'layer') {
      this._store.dispatch(
        updateLayer({ layer: { id: item.layer.id, changes: { sortKey } } }),
      );
    } else {
      this._store.dispatch(
        updateLayerGroup({ layerGroup: { id: item.group.id, changes: { sortKey } } }),
      );
    }
  }

  private _moveInto(
    item: OrganizeItem,
    sectionId: string | null,
    groupId: string | null,
    sortKey: string | null,
  ): void {
    if (item.kind === 'layer') {
      this._store.dispatch(
        updateLayer({
          layer: { id: item.layer.id, changes: { sectionId, groupId, sortKey } },
        }),
      );
    } else {
      this._store.dispatch(
        updateLayerGroup({
          layerGroup: {
            id: item.group.id,
            changes: { sectionId, parentGroupId: groupId, sortKey },
          },
        }),
      );
    }
  }

  private async _snapshot(projectId: string): Promise<{
    layers: readonly Layer[];
    groups: readonly LayerGroup[];
    index: GroupIndex;
  }> {
    const [layers, groups] = await Promise.all([
      firstValueFrom(
        this._store
          .select(selectLayersByProjectIdMap)
          .pipe(map((m) => m.get(projectId) ?? [])),
      ),
      firstValueFrom(this.getGroupsByProjectId$(projectId)),
    ]);
    return { layers, groups, index: buildGroupIndex(groups) };
  }
}

const orderable = (item: OrganizeItem): { createdAt: number; sortKey?: string | null } =>
  item.kind === 'layer' ? item.layer : item.group;

const sameItem = (a: OrganizeItem, b: OrganizeItem): boolean =>
  a.kind === b.kind &&
  (a.kind === 'layer'
    ? a.layer.id === (b as { layer: Layer }).layer.id
    : a.group.id === (b as { group: LayerGroup }).group.id);

/**
 * After a loop of dispatches, let the op-log capture flush (AGENTS.md rule 6:
 * many rapid dispatches can otherwise lose state).
 */
const yieldForPersistence = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
