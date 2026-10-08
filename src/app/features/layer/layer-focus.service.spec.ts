import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Action } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { LayerFocusService } from './layer-focus.service';
import { Layer } from './layer.model';
import { TaskService } from '../tasks/task.service';
import { selectTaskEntities } from '../tasks/store/task.selectors';
import { Task } from '../tasks/task.model';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { updateLayer } from './store/layer.actions';
import { showFocusOverlay } from '../focus-mode/store/focus-mode.actions';
import { GlobalConfigService } from '../config/global-config.service';

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

  const setTasks = (tasks: Partial<Task>[]): void => {
    store.overrideSelector(
      selectTaskEntities,
      Object.fromEntries(tasks.map((t) => [t.id, t as Task])),
    );
    store.refreshState();
  };

  beforeEach(() => {
    isFocusModeEnabled = true;
    taskService = jasmine.createSpyObj<TaskService>('TaskService', [
      'createNewTaskWithDefaults',
      'setCurrentId',
    ]);
    taskService.createNewTaskWithDefaults.and.callFake(
      ({ title, workContextId }) =>
        ({ id: 'newGoal', title, projectId: workContextId }) as Task,
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
            instant: (_key: string, params: { title: string }) =>
              `Work on: ${params.title}`,
          },
        },
      ],
    });
    service = TestBed.inject(LayerFocusService);
    store = TestBed.inject(MockStore);
    dispatched = [];
    spyOn(store, 'dispatch').and.callFake(((a: Action) => {
      dispatched.push(a);
    }) as unknown as MockStore['dispatch']);
  });

  it('first ▶ creates the goal in the layer project, links it, then focuses it', async () => {
    setTasks([]);
    await service.workOn(layer());

    const add = dispatched[0] as ReturnType<typeof TaskSharedActions.addTask>;
    expect(add.type).toBe(TaskSharedActions.addTask.type);
    expect(add.task.title).toBe('Work on: Shot A #rough');
    expect(add.workContextId).toBe('p1');
    expect(add.isIgnoreShortSyntax).toBe(true);
    expect(dispatched[1]).toEqual(
      updateLayer({ layer: { id: 'l1', changes: { focusTaskId: 'newGoal' } } }),
    );
    expect(taskService.setCurrentId).toHaveBeenCalledWith('newGoal');
    expect(dispatched.at(-1)!.type).toBe(showFocusOverlay.type);
  });

  it('reuses the linked goal while it is open', async () => {
    setTasks([{ id: 'g1', isDone: false }]);
    await service.workOn(layer({ focusTaskId: 'g1' }));

    expect(taskService.createNewTaskWithDefaults).not.toHaveBeenCalled();
    expect(dispatched.map((a) => a.type)).toEqual([showFocusOverlay.type]);
    expect(taskService.setCurrentId).toHaveBeenCalledWith('g1');
  });

  it('creates a fresh goal when the linked one is done or gone', async () => {
    setTasks([{ id: 'g1', isDone: true }]);
    await service.workOn(layer({ focusTaskId: 'g1' }));
    await service.workOn(layer({ focusTaskId: 'archived' }));

    expect(taskService.createNewTaskWithDefaults).toHaveBeenCalledTimes(2);
    expect(taskService.setCurrentId.calls.allArgs()).toEqual([['newGoal'], ['newGoal']]);
  });

  it('only starts tracking when focus mode is switched off', async () => {
    isFocusModeEnabled = false;
    setTasks([{ id: 'g1', isDone: false }]);
    await service.workOn(layer({ focusTaskId: 'g1' }));

    expect(taskService.setCurrentId).toHaveBeenCalledWith('g1');
    expect(dispatched.length).toBe(0);
  });
});
