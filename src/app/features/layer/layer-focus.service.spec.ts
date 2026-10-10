import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Action } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import {
  findLayerGoalParentId,
  foldableLayerGoalIds,
  LayerFocusService,
} from './layer-focus.service';
import { Layer } from './layer.model';
import { TaskService } from '../tasks/task.service';
import { selectCurrentTaskId, selectTaskEntities } from '../tasks/store/task.selectors';
import { selectPausedTaskId } from '../focus-mode/store/focus-mode.selectors';
import { selectLayersByProjectIdMap } from './store/layer.selectors';
import { Task } from '../tasks/task.model';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { addSubTask } from '../tasks/store/task.actions';
import { updateLayer } from './store/layer.actions';
import { showFocusOverlay } from '../focus-mode/store/focus-mode.actions';
import { GlobalConfigService } from '../config/global-config.service';
import { T } from '../../t.const';

describe('LayerFocusService', () => {
  let service: LayerFocusService;
  let store: MockStore;
  let dispatched: Action[];
  let taskService: jasmine.SpyObj<TaskService>;
  let isFocusModeEnabled: boolean;

  const layer = (extra: Partial<Layer> = {}): Layer => ({
    id: 'l1',
    projectId: 'p1',
    title: 'Shot A #rough',
    createdAt: 0,
    ...extra,
  });
  const task = (id: string, extra: Partial<Task> = {}): Task =>
    ({
      id,
      projectId: 'p1',
      isDone: false,
      parentId: undefined,
      subTaskIds: [],
      ...extra,
    }) as Task;

  const setState = (tasks: Task[], layers: Layer[] = []): void => {
    store.overrideSelector(
      selectTaskEntities,
      Object.fromEntries(tasks.map((t) => [t.id, t])),
    );
    store.overrideSelector(selectLayersByProjectIdMap, new Map([['p1', layers]]));
    store.refreshState();
  };
  const types = (): string[] => dispatched.map((a) => a.type);

  beforeEach(() => {
    isFocusModeEnabled = true;
    taskService = jasmine.createSpyObj<TaskService>('TaskService', [
      'createNewTaskWithDefaults',
      'setCurrentId',
    ]);
    taskService.createNewTaskWithDefaults.and.callFake(
      ({ title, workContextId }) =>
        ({
          id: title === 'Layers' ? 'parent' : 'newGoal',
          title,
          projectId: workContextId,
        }) as Task,
    );
    TestBed.configureTestingModule({
      providers: [
        LayerFocusService,
        provideMockStore(),
        { provide: TaskService, useValue: taskService },
        {
          provide: GlobalConfigService,
          useValue: { appFeatures: () => ({ isFocusModeEnabled }) },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: (key: string, params?: { title: string }) =>
              key === T.F.LAYER.GOAL_PARENT_TITLE
                ? 'Layers'
                : `Work on: ${params?.title}`,
          },
        },
      ],
    });
    service = TestBed.inject(LayerFocusService);
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentTaskId, null);
    store.overrideSelector(selectPausedTaskId, null);
    dispatched = [];
    spyOn(store, 'dispatch').and.callFake(((a: Action) => {
      dispatched.push(a);
    }) as unknown as MockStore['dispatch']);
  });

  it('first ▶ in a project adds the "Layers" parent, the goal under it, then focuses', async () => {
    setState([], [layer()]);
    await service.workOn(layer());

    const parent = dispatched[0] as ReturnType<typeof TaskSharedActions.addTask>;
    expect(parent.type).toBe(TaskSharedActions.addTask.type);
    expect(parent.task.title).toBe('Layers');
    expect(parent.workContextId).toBe('p1');
    const goal = dispatched[1] as ReturnType<typeof addSubTask>;
    expect(goal.type).toBe(addSubTask.type);
    expect(goal.parentId).toBe('parent');
    expect(goal.task.title).toBe('Work on: Shot A #rough');
    expect(goal.isIgnoreShortSyntax).toBe(true);
    expect(dispatched[2]).toEqual(
      updateLayer({ layer: { id: 'l1', changes: { focusTaskId: 'newGoal' } } }),
    );
    expect(taskService.setCurrentId).toHaveBeenCalledWith('newGoal');
    expect(types().at(-1)).toBe(showFocusOverlay.type);
  });

  it('a new goal goes under the existing parent', async () => {
    const other = layer({ id: 'l2', focusTaskId: 'g2' });
    setState(
      [task('P', { subTaskIds: ['g2'] }), task('g2', { parentId: 'P' })],
      [layer(), other],
    );
    await service.workOn(layer());

    expect(types()).toEqual([addSubTask.type, updateLayer.type, showFocusOverlay.type]);
    expect((dispatched[0] as ReturnType<typeof addSubTask>).parentId).toBe('P');
  });

  it('folds open top-level goals under the parent once', async () => {
    setState(
      [task('g1'), task('g2'), task('g3', { isDone: true })],
      [
        layer({ focusTaskId: 'g1' }),
        layer({ id: 'l2', focusTaskId: 'g2' }),
        layer({ id: 'l3', focusTaskId: 'g3' }),
      ],
    );
    await service.workOn(layer({ focusTaskId: 'g1' }));

    expect(types()).toEqual([
      TaskSharedActions.addTask.type,
      TaskSharedActions.convertToSubTask.type,
      TaskSharedActions.convertToSubTask.type,
      showFocusOverlay.type,
    ]);
    expect(
      dispatched
        .slice(1, 3)
        .map((a) => (a as ReturnType<typeof TaskSharedActions.convertToSubTask>).taskId),
    ).toEqual(['g1', 'g2']);
    // The open goal is reused, not recreated.
    expect(taskService.setCurrentId).toHaveBeenCalledWith('g1');
  });

  it('reuses the linked goal while it is open, with nothing to fold', async () => {
    setState(
      [task('P', { subTaskIds: ['g1'] }), task('g1', { parentId: 'P' })],
      [layer({ focusTaskId: 'g1' })],
    );
    await service.workOn(layer({ focusTaskId: 'g1' }));

    expect(taskService.createNewTaskWithDefaults).not.toHaveBeenCalled();
    expect(types()).toEqual([showFocusOverlay.type]);
    expect(taskService.setCurrentId).toHaveBeenCalledWith('g1');
  });

  it('creates a fresh goal when the linked one is done or gone', async () => {
    setState(
      [task('P', { subTaskIds: ['g1'] }), task('g1', { parentId: 'P', isDone: true })],
      [layer({ focusTaskId: 'g1' })],
    );
    await service.workOn(layer({ focusTaskId: 'g1' }));
    await service.workOn(layer({ focusTaskId: 'archived' }));

    expect(taskService.setCurrentId.calls.allArgs()).toEqual([['newGoal'], ['newGoal']]);
    // The parent of the done goal is still open, so it is reused.
    expect((dispatched[0] as ReturnType<typeof addSubTask>).parentId).toBe('P');
  });

  it('only starts tracking when focus mode is switched off', async () => {
    isFocusModeEnabled = false;
    setState([task('g1', { parentId: 'P' }), task('P')], [layer({ focusTaskId: 'g1' })]);
    await service.workOn(layer({ focusTaskId: 'g1' }));

    expect(taskService.setCurrentId).toHaveBeenCalledWith('g1');
    expect(dispatched.length).toBe(0);
  });

  it('only reopens focus mode when this layer is already being worked on', async () => {
    setState([task('g1', { parentId: 'P' }), task('P')], [layer({ focusTaskId: 'g1' })]);
    store.overrideSelector(selectPausedTaskId, 'g1');
    store.refreshState();
    await service.workOn(layer({ focusTaskId: 'g1' }));

    expect(taskService.setCurrentId).not.toHaveBeenCalled();
    expect(types()).toEqual([showFocusOverlay.type]);
  });

  describe('helpers', () => {
    const entities = {
      P: task('P'),
      done: task('done', { isDone: true }),
      g1: task('g1', { parentId: 'P' }),
      g2: task('g2', { parentId: 'done' }),
      top: task('top'),
      rep: task('rep', { repeatCfgId: 'r' }),
      other: task('other', { projectId: 'p2' }),
    };

    it('finds the open top-level parent of a layer goal', () => {
      expect(findLayerGoalParentId('p1', [layer({ focusTaskId: 'g2' })], entities)).toBe(
        null,
      );
      expect(
        findLayerGoalParentId(
          'p1',
          [layer({ focusTaskId: 'g2' }), layer({ id: 'l2', focusTaskId: 'g1' })],
          entities,
        ),
      ).toBe('P');
    });

    it('folds only open, plain, top-level goals of the project', () => {
      const layers = ['g1', 'top', 'rep', 'other', 'gone'].map((id, i) =>
        layer({ id: `l${i}`, focusTaskId: id }),
      );
      expect(foldableLayerGoalIds('p1', layers, entities)).toEqual(['top']);
    });
  });
});
