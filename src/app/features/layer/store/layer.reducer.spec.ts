import { initialLayerState, layerReducer } from './layer.reducer';
import { addLayer, deleteLayer, moveLayerToProject, updateLayer } from './layer.actions';
import { Layer, LayerState } from '../layer.model';
import { MAX_LAYER_TITLE_LENGTH } from '../layer.util';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { loadAllData } from '../../../root-store/meta/load-all-data.action';
import { AppDataComplete } from '../../../op-log/model/model-config';

const makeLayer = (overrides: Partial<Layer> = {}): Layer => ({
  id: 'l1',
  projectId: 'p1',
  title: 'Rough storyboard exists',
  createdAt: 1000,
  sectionId: null,
  imageId: null,
  ...overrides,
});

const stateWith = (layers: Layer[]): LayerState => ({
  ids: layers.map((l) => l.id),
  entities: Object.fromEntries(layers.map((l) => [l.id, l])),
});

describe('layerReducer', () => {
  describe('addLayer', () => {
    it('adds the layer', () => {
      const state = layerReducer(initialLayerState, addLayer({ layer: makeLayer() }));
      expect(state.ids).toEqual(['l1']);
      expect(state.entities['l1']).toEqual(makeLayer());
    });

    it('trims and caps the title', () => {
      const long = 'x'.repeat(MAX_LAYER_TITLE_LENGTH + 50);
      const state = layerReducer(
        initialLayerState,
        addLayer({ layer: makeLayer({ title: `  ${long}  ` }) }),
      );
      expect(state.entities['l1']!.title.length).toBe(MAX_LAYER_TITLE_LENGTH);
    });
  });

  describe('updateLayer', () => {
    it('updates editable fields', () => {
      const state = layerReducer(
        stateWith([makeLayer()]),
        updateLayer({ layer: { id: 'l1', changes: { title: 'New', sectionId: 's1' } } }),
      );
      expect(state.entities['l1']!.title).toBe('New');
      expect(state.entities['l1']!.sectionId).toBe('s1');
    });

    it('ignores changes to id, projectId and createdAt', () => {
      const state = layerReducer(
        stateWith([makeLayer()]),
        updateLayer({
          layer: {
            id: 'l1',
            changes: { id: 'hijack', projectId: 'p2', createdAt: 5, title: 'Kept' },
          },
        }),
      );
      expect(state.ids).toEqual(['l1']);
      expect(state.entities['l1']).toEqual(makeLayer({ title: 'Kept' }));
    });

    it('sanitizes a malformed title to an empty string', () => {
      const state = layerReducer(
        stateWith([makeLayer()]),
        updateLayer({
          layer: { id: 'l1', changes: { title: null as unknown as string } },
        }),
      );
      expect(state.entities['l1']!.title).toBe('');
    });

    it('is a no-op for an unknown id', () => {
      const before = stateWith([makeLayer()]);
      const state = layerReducer(
        before,
        updateLayer({ layer: { id: 'missing', changes: { title: 'x' } } }),
      );
      expect(state).toEqual(before);
    });
  });

  describe('moveLayerToProject', () => {
    it('re-homes the layer and clears what belonged to the old project', () => {
      const layer = makeLayer({
        sectionId: 's1',
        labelId: 'oldLabel',
        groupId: 'g1',
        sortKey: 'm',
        focusTaskId: 't1',
        imageId: 'img',
      });
      const state = layerReducer(
        stateWith([layer]),
        moveLayerToProject({ id: 'l1', projectId: 'p2', labelId: 'newLabel' }),
      );
      expect(state.entities['l1']).toEqual({
        ...layer,
        projectId: 'p2',
        labelId: 'newLabel',
        sectionId: null,
        groupId: null,
        sortKey: null,
        focusTaskId: null,
      });
    });

    it('is a no-op for an unknown id or an empty project id', () => {
      const state = stateWith([makeLayer()]);
      expect(
        layerReducer(
          state,
          moveLayerToProject({ id: 'nope', projectId: 'p2', labelId: null }),
        ),
      ).toBe(state);
      expect(
        layerReducer(
          state,
          moveLayerToProject({ id: 'l1', projectId: '', labelId: null }),
        ),
      ).toBe(state);
    });
  });

  it('deleteLayer removes the layer', () => {
    const state = layerReducer(
      stateWith([makeLayer(), makeLayer({ id: 'l2' })]),
      deleteLayer({ id: 'l1' }),
    );
    expect(state.ids).toEqual(['l2']);
  });

  it('deleteProject removes only that project’s layers', () => {
    const state = layerReducer(
      stateWith([
        makeLayer({ id: 'a', projectId: 'p1' }),
        makeLayer({ id: 'b', projectId: 'p2' }),
        makeLayer({ id: 'c', projectId: 'p1' }),
      ]),
      TaskSharedActions.deleteProject({ projectId: 'p1', noteIds: [], allTaskIds: [] }),
    );
    expect(state.ids).toEqual(['b']);
  });

  it('deleteProject without layers returns the same state', () => {
    const before = stateWith([makeLayer({ projectId: 'p2' })]);
    const state = layerReducer(
      before,
      TaskSharedActions.deleteProject({ projectId: 'p1', noteIds: [], allTaskIds: [] }),
    );
    expect(state).toBe(before);
  });

  describe('loadAllData', () => {
    it('replaces state with the imported slice', () => {
      const imported = stateWith([makeLayer({ id: 'imported' })]);
      const state = layerReducer(
        stateWith([makeLayer()]),
        loadAllData({
          appDataComplete: { layer: imported } as unknown as AppDataComplete,
        }),
      );
      expect(state).toBe(imported);
    });

    it('starts empty when the data predates layers', () => {
      const state = layerReducer(
        stateWith([makeLayer()]),
        loadAllData({ appDataComplete: {} as unknown as AppDataComplete }),
      );
      expect(state).toEqual(initialLayerState);
    });
  });
});
