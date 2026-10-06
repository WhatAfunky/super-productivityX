import { Layer } from '../layer.model';
import { selectLayersByProjectIdMap } from './layer.selectors';

const makeLayer = (overrides: Partial<Layer>): Layer => ({
  id: 'l',
  projectId: 'p1',
  title: 'Layer',
  createdAt: 0,
  ...overrides,
});

describe('selectLayersByProjectIdMap', () => {
  it('groups layers by project, newest first', () => {
    const layers = [
      makeLayer({ id: 'old', createdAt: 1 }),
      makeLayer({ id: 'other', projectId: 'p2', createdAt: 5 }),
      makeLayer({ id: 'new', createdAt: 3 }),
    ];
    const map = selectLayersByProjectIdMap.projector(layers);
    expect(map.get('p1')!.map((l) => l.id)).toEqual(['new', 'old']);
    expect(map.get('p2')!.map((l) => l.id)).toEqual(['other']);
  });

  it('breaks createdAt ties by id so the order is stable', () => {
    const layers = [
      makeLayer({ id: 'a', createdAt: 7 }),
      makeLayer({ id: 'c', createdAt: 7 }),
      makeLayer({ id: 'b', createdAt: 7 }),
    ];
    const map = selectLayersByProjectIdMap.projector(layers);
    expect(map.get('p1')!.map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not touch Object.prototype for a crafted project id', () => {
    const map = selectLayersByProjectIdMap.projector([
      makeLayer({ projectId: '__proto__' }),
    ]);
    expect(map.get('__proto__')!.length).toBe(1);
    expect(({} as Record<string, unknown>)['length']).toBeUndefined();
  });
});
