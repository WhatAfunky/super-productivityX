import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Action } from '@ngrx/store';
import { LayerOrganizeService } from './layer-organize.service';
import { Layer } from './layer.model';
import { LayerGroup } from './layer-group.model';
import { selectLayersByProjectIdMap } from './store/layer.selectors';
import { selectLayerGroupsByProjectIdMap } from './store/layer-group.selectors';
import { updateLayer } from './store/layer.actions';
import {
  addLayerGroup,
  deleteLayerGroup,
  updateLayerGroup,
} from './store/layer-group.actions';

describe('LayerOrganizeService', () => {
  let service: LayerOrganizeService;
  let store: MockStore;
  let dispatched: Action[];

  const layer = (id: string, extra: Partial<Layer> = {}): Layer => ({
    id,
    projectId: 'p1',
    title: id,
    createdAt: Number(id.replace(/\D/g, '')) || 0,
    sectionId: 's1',
    ...extra,
  });
  const group = (id: string, extra: Partial<LayerGroup> = {}): LayerGroup => ({
    id,
    projectId: 'p1',
    name: id,
    createdAt: 0,
    sectionId: 's1',
    ...extra,
  });

  const setState = (layers: Layer[], groups: LayerGroup[] = []): void => {
    store.overrideSelector(selectLayersByProjectIdMap, new Map([['p1', layers]]));
    store.overrideSelector(selectLayerGroupsByProjectIdMap, new Map([['p1', groups]]));
    store.refreshState();
  };

  const ops = <T>(creator: { type: string }): T[] =>
    dispatched.filter((a) => a.type === creator.type) as unknown as T[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LayerOrganizeService, provideMockStore()],
    });
    service = TestBed.inject(LayerOrganizeService);
    store = TestBed.inject(MockStore);
    dispatched = [];
    spyOn(store, 'dispatch').and.callFake(((a: Action) => {
      dispatched.push(a);
    }) as unknown as MockStore['dispatch']);
  });

  it('group: one new group plus one single-entity update per child', async () => {
    setState([layer('l3'), layer('l2'), layer('l1')]);
    const items = [
      { kind: 'layer' as const, layer: layer('l3') },
      { kind: 'layer' as const, layer: layer('l1') },
    ];

    const id = await service.group(
      'p1',
      { sectionId: 's1', groupId: null },
      items,
      'Shot A',
    );

    const added = ops<ReturnType<typeof addLayerGroup>>(addLayerGroup);
    expect(added.length).toBe(1);
    expect(added[0].layerGroup).toEqual(
      jasmine.objectContaining({
        id: id!,
        name: 'Shot A',
        sectionId: 's1',
        parentGroupId: null,
      }),
    );
    const updates = ops<ReturnType<typeof updateLayer>>(updateLayer);
    expect(updates.map((u) => u.layer.id)).toEqual(['l3', 'l1']); // display order kept
    expect(updates.every((u) => u.layer.changes.groupId === id)).toBe(true);
    const keys = updates.map((u) => u.layer.changes.sortKey!);
    expect(keys[0] < keys[1]).toBe(true);
  });

  it('group: refuses to go past 3 levels', async () => {
    const groups = [
      group('a'),
      group('b', { parentGroupId: 'a' }),
      group('c', { parentGroupId: 'b' }),
    ];
    setState([layer('l1', { groupId: 'c' })], groups);
    const id = await service.group(
      'p1',
      { sectionId: 's1', groupId: 'c' },
      [{ kind: 'layer', layer: layer('l1', { groupId: 'c' }) }],
      'Too deep',
    );
    expect(id).toBeNull();
    expect(dispatched.length).toBe(0);
  });

  it('ungroup: children move up one level, then the group is deleted', async () => {
    const groups = [group('outer'), group('inner', { parentGroupId: 'outer' })];
    setState(
      [layer('l1', { groupId: 'inner' }), layer('l2', { groupId: 'outer' })],
      groups,
    );

    await service.ungroup(groups[1]);

    const updates = ops<ReturnType<typeof updateLayer>>(updateLayer);
    expect(updates.length).toBe(1);
    expect(updates[0].layer).toEqual({
      id: 'l1',
      changes: { sectionId: 's1', groupId: 'outer', sortKey: null },
    });
    expect(ops<ReturnType<typeof deleteLayerGroup>>(deleteLayerGroup)[0].id).toBe(
      'inner',
    );
    // the deletion comes after the moves
    expect(dispatched.at(-1)!.type).toBe(deleteLayerGroup.type);
  });

  it('move: the first manual move keys every sibling, later moves touch one item', async () => {
    // date order (newest first): l3, l2, l1
    setState([layer('l3'), layer('l2'), layer('l1')]);
    await service.move('p1', { sectionId: 's1', groupId: null }, 2, 0); // l1 to top

    const first = ops<ReturnType<typeof updateLayer>>(updateLayer);
    // three keys assigned, then l1's key set once more
    expect(first.length).toBe(4);
    const finalKey = new Map(first.map((u) => [u.layer.id, u.layer.changes.sortKey!]));
    const order = [...finalKey.entries()]
      .sort((a, b) => (a[1] < b[1] ? -1 : 1))
      .map((e) => e[0]);
    expect(order).toEqual(['l1', 'l3', 'l2']);

    dispatched = [];
    setState([
      layer('l1', { sortKey: finalKey.get('l1') }),
      layer('l3', { sortKey: finalKey.get('l3') }),
      layer('l2', { sortKey: finalKey.get('l2') }),
    ]);
    await service.move('p1', { sectionId: 's1', groupId: null }, 0, 2); // l1 to bottom
    expect(dispatched.length).toBe(1);
    const moved = (dispatched[0] as ReturnType<typeof updateLayer>).layer;
    expect(moved.id).toBe('l1');
    expect(moved.changes.sortKey! > finalKey.get('l2')!).toBe(true);
  });

  it('topKeyFor: none in date order, a key above the first in manual order', async () => {
    setState([layer('l1'), layer('l2')]);
    expect(await service.topKeyFor('p1', { sectionId: 's1', groupId: null })).toBeNull();

    setState([layer('l1', { sortKey: 'm' }), layer('l2', { sortKey: 't' })]);
    const key = await service.topKeyFor('p1', { sectionId: 's1', groupId: null });
    expect(key! < 'm').toBe(true);
  });

  it('getSiblings mixes groups and loose layers of one container', async () => {
    setState(
      [layer('l1'), layer('l2', { groupId: 'g1' }), layer('l3', { sectionId: 'other' })],
      [group('g1', { createdAt: 5 })],
    );
    const top = await service.getSiblings('p1', { sectionId: 's1', groupId: null });
    expect(top.map((i) => (i.kind === 'layer' ? i.layer.id : i.group.id))).toEqual([
      'g1',
      'l1',
    ]);
    const inside = await service.getSiblings('p1', { sectionId: 's1', groupId: 'g1' });
    expect(inside.map((i) => (i.kind === 'layer' ? i.layer.id : ''))).toEqual(['l2']);
    expect(updateLayerGroup).toBeDefined();
  });
});
