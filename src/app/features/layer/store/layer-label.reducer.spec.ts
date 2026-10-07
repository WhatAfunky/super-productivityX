import { initialLayerLabelState, layerLabelReducer } from './layer-label.reducer';
import { addLayerLabel, deleteLayerLabel, updateLayerLabel } from './layer-label.actions';
import { LayerLabel, LayerLabelState } from '../layer-label.model';
import { selectVisibleLayerLabelsByProjectIdMap } from './layer-label.selectors';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { loadAllData } from '../../../root-store/meta/load-all-data.action';
import { AppDataComplete } from '../../../op-log/model/model-config';

const makeLabel = (overrides: Partial<LayerLabel> = {}): LayerLabel => ({
  id: 'l1',
  projectId: 'p1',
  name: 'Code',
  color: 'blue',
  ...overrides,
});

const stateWith = (labels: LayerLabel[]): LayerLabelState => ({
  ids: labels.map((l) => l.id),
  entities: Object.fromEntries(labels.map((l) => [l.id, l])),
});

describe('layerLabelReducer', () => {
  it('adds a label with a sanitized name and colour', () => {
    const state = layerLabelReducer(
      initialLayerLabelState,
      addLayerLabel({ layerLabel: makeLabel({ name: '  Code  ', color: '#ff0000' }) }),
    );
    expect(state.entities['l1']).toEqual(makeLabel({ name: 'Code', color: 'grey' }));
  });

  it('renames, recolours and merges, never changing id or projectId', () => {
    const state = layerLabelReducer(
      stateWith([makeLabel(), makeLabel({ id: 'l2', name: 'Art' })]),
      updateLayerLabel({
        layerLabel: {
          id: 'l1',
          changes: {
            id: 'x',
            projectId: 'p9',
            name: 'Programming',
            color: 'pink',
            mergedIntoId: 'l2',
          },
        },
      }),
    );
    expect(state.entities['l1']).toEqual(
      makeLabel({ name: 'Programming', color: 'pink', mergedIntoId: 'l2' }),
    );
  });

  it('refuses to merge a label into itself', () => {
    const state = layerLabelReducer(
      stateWith([makeLabel()]),
      updateLayerLabel({ layerLabel: { id: 'l1', changes: { mergedIntoId: 'l1' } } }),
    );
    expect(state.entities['l1']!.mergedIntoId).toBeUndefined();
  });

  it('deletes a label', () => {
    const state = layerLabelReducer(
      stateWith([makeLabel()]),
      deleteLayerLabel({ id: 'l1' }),
    );
    expect(state.ids).toEqual([]);
  });

  it('removes only the deleted project’s labels', () => {
    const state = layerLabelReducer(
      stateWith([
        makeLabel({ id: 'a', projectId: 'p1' }),
        makeLabel({ id: 'b', projectId: 'p2' }),
      ]),
      TaskSharedActions.deleteProject({ projectId: 'p1', noteIds: [], allTaskIds: [] }),
    );
    expect(state.ids).toEqual(['b']);
  });

  it('starts empty when imported data predates labels', () => {
    const state = layerLabelReducer(
      stateWith([makeLabel()]),
      loadAllData({ appDataComplete: {} as unknown as AppDataComplete }),
    );
    expect(state).toEqual(initialLayerLabelState);
  });
});

describe('selectVisibleLayerLabelsByProjectIdMap', () => {
  it('hides merged-away labels, keeps a merge cycle visible, sorts by name', () => {
    const labels = [
      makeLabel({ id: 'sound', name: 'Sound', mergedIntoId: 'sfx' }),
      makeLabel({ id: 'sfx', name: 'SFX' }),
      makeLabel({ id: 'art', name: 'Art' }),
      makeLabel({ id: 'x', name: 'X', projectId: 'p2', mergedIntoId: 'y' }),
      makeLabel({ id: 'y', name: 'Y', projectId: 'p2', mergedIntoId: 'x' }),
    ];
    const entities = Object.fromEntries(labels.map((l) => [l.id, l]));
    const map = selectVisibleLayerLabelsByProjectIdMap.projector(labels, entities);
    expect(map.get('p1')!.map((l) => l.id)).toEqual(['art', 'sfx']);
    expect(
      map
        .get('p2')!
        .map((l) => l.id)
        .sort(),
    ).toEqual(['x', 'y']);
  });
});
