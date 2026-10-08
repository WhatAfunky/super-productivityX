import { LayerGroup } from './layer-group.model';
import {
  buildFolderTree,
  buildGroupIndex,
  canGroupUnder,
  compareSiblings,
  groupHeight,
  TreeNode,
} from './layer-group.util';

const g = (id: string, extra: Partial<LayerGroup> = {}): LayerGroup => ({
  id,
  projectId: 'p1',
  name: id,
  createdAt: 0,
  sectionId: 's1',
  ...extra,
});

describe('layer-group.util', () => {
  it('resolves parents, depth and folder (nested groups use their root folder)', () => {
    const index = buildGroupIndex([
      g('a'),
      g('b', { parentGroupId: 'a', sectionId: 'other' }),
      g('c', { parentGroupId: 'b' }),
    ]);
    expect(index.depthOf.get('c')).toBe(3);
    expect(index.folderOf.get('c')).toBe('s1');
    expect(index.folderOf.get('b')).toBe('s1');
    expect(groupHeight('a', index)).toBe(3);
  });

  it('treats missing parents and cycles as top level', () => {
    const index = buildGroupIndex([
      g('orphan', { parentGroupId: 'gone' }),
      g('x', { parentGroupId: 'y' }),
      g('y', { parentGroupId: 'x' }),
      g('self', { parentGroupId: 'self' }),
    ]);
    expect(index.parentOf.get('orphan')).toBeNull();
    expect(index.parentOf.get('self')).toBeNull();
    // One side of the cycle is cut; nothing is lost or looped.
    const tops = ['x', 'y'].filter((id) => index.parentOf.get(id) === null);
    expect(tops.length).toBeGreaterThanOrEqual(1);
    expect(index.depthOf.get('x')! + index.depthOf.get('y')!).toBeLessThanOrEqual(3);
  });

  it('enforces the 3-level limit when grouping', () => {
    const index = buildGroupIndex([g('a'), g('b', { parentGroupId: 'a' })]);
    expect(canGroupUnder(null, [], index)).toBe(true); // new top-level group
    expect(canGroupUnder('b', [], index)).toBe(true); // level 3
    // wrapping 'a' (2 levels tall) in a new top-level group → 3 levels: ok
    expect(canGroupUnder(null, ['a'], index)).toBe(true);
    // wrapping 'a' inside another group → 4 levels: refused
    const deeper = buildGroupIndex([g('a'), g('b', { parentGroupId: 'a' }), g('top')]);
    expect(canGroupUnder('top', ['a'], deeper)).toBe(false);
  });

  it('orders siblings: unkeyed newest first, then manual keys ascending', () => {
    const items = [
      { createdAt: 1, sortKey: 'm' },
      { createdAt: 5 },
      { createdAt: 2, sortKey: 'c' },
      { createdAt: 9 },
    ];
    expect([...items].sort(compareSiblings)).toEqual([
      { createdAt: 9 },
      { createdAt: 5 },
      { createdAt: 2, sortKey: 'c' },
      { createdAt: 1, sortKey: 'm' },
    ]);
  });

  it('builds a folder tree with grouped layers inside their group', () => {
    const groups = [g('shotA', { sortKey: 'b' }), g('inner', { parentGroupId: 'shotA' })];
    const index = buildGroupIndex(groups);
    const row = (
      id: string,
      extra: object = {},
    ): { layer: { id: string; createdAt: number } } => ({
      layer: { id, createdAt: 0, ...extra },
    });
    const tree = buildFolderTree(
      [
        row('loose', { sortKey: 'a' }),
        row('inA', { groupId: 'shotA' }),
        row('deep', { groupId: 'inner' }),
        row('lostGroup', { groupId: 'gone', sortKey: 'c' }),
      ],
      groups,
      index,
    );
    const shape = (nodes: TreeNode<{ layer: { id: string } }>[]): unknown[] =>
      nodes.map((n) =>
        n.kind === 'layer'
          ? n.row.layer.id
          : { [n.group.id]: shape(n.children), n: n.layerCount },
      );
    expect(shape(tree)).toEqual([
      'loose',
      { shotA: [{ inner: ['deep'], n: 1 }, 'inA'], n: 2 },
      'lostGroup',
    ]);
  });
});
