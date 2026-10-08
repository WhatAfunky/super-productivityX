import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Action } from '@ngrx/store';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { LayerUiEffects } from './layer-ui.effects';
import { LOCAL_ACTIONS } from '../../../util/local-actions.token';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import {
  selectCurrentTaskId,
  selectTaskEntities,
} from '../../tasks/store/task.selectors';
import { completeFocusSession } from '../../focus-mode/store/focus-mode.actions';
import { selectPausedTaskId } from '../../focus-mode/store/focus-mode.selectors';
import { selectProjectFeatureState } from '../../project/store/project.selectors';
import { TaskMultiSelectService } from '../../tasks/task-multi-select.service';
import { SnackService } from '../../../core/snack/snack.service';
import { SnackParams } from '../../../core/snack/snack.model';
import { LayerService } from '../layer.service';
import { Task } from '../../tasks/task.model';
import { Project, ProjectState } from '../../project/project.model';

describe('LayerUiEffects', () => {
  let actions$: Subject<Action>;
  let store: MockStore;
  let snack: jasmine.SpyObj<SnackService>;
  let layerService: jasmine.SpyObj<LayerService>;
  const isBulk = signal(false);

  const projects = (
    isLayersEnabled: boolean,
    isLayerSessionNudgeEnabled = false,
  ): ProjectState => ({
    ids: ['p1'],
    entities: {
      p1: { id: 'p1', isLayersEnabled, isLayerSessionNudgeEnabled } as Project,
    },
  });
  const tasks = {
    goal: { id: 'goal', projectId: 'p1', parentId: undefined } as unknown as Task,
    sub: { id: 'sub', projectId: 'p1', parentId: 'goal' } as unknown as Task,
  };

  const done = (id: string, isDone = true): Action =>
    TaskSharedActions.updateTask({ task: { id, changes: { isDone } } });

  beforeEach(() => {
    actions$ = new Subject<Action>();
    snack = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    layerService = jasmine.createSpyObj<LayerService>('LayerService', [
      'openAddLayerDialog',
      'deleteOrphanedImages',
    ]);
    layerService.deleteOrphanedImages.and.resolveTo(0);
    isBulk.set(false);
    TestBed.configureTestingModule({
      providers: [
        LayerUiEffects,
        provideMockStore(),
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: SnackService, useValue: snack },
        { provide: LayerService, useValue: layerService },
        {
          provide: TaskMultiSelectService,
          useValue: { isBulkFeedbackSuppressed: isBulk },
        },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectTaskEntities, tasks);
    store.overrideSelector(selectProjectFeatureState, projects(true));
    store.overrideSelector(selectCurrentTaskId, null);
    store.overrideSelector(selectPausedTaskId, null);
    const effects = TestBed.inject(LayerUiEffects);
    effects.offerLayerOnGoalDone$.subscribe();
    effects.deleteImagesOfDeletedProject$.subscribe();
    effects.offerLayerAfterFocusSession$.subscribe();
  });

  it('offers "Name the layer" when a goal in a Layers project is completed', () => {
    actions$.next(done('goal'));

    expect(snack.open).toHaveBeenCalledTimes(1);
    const params = snack.open.calls.mostRecent().args[0] as SnackParams;
    params.actionFn!();
    expect(layerService.openAddLayerDialog).toHaveBeenCalledOnceWith('p1');
  });

  it('stays quiet for un-done, subtasks, bulk completion and projects without Layers', () => {
    actions$.next(done('goal', false));
    actions$.next(done('sub'));
    isBulk.set(true);
    actions$.next(done('goal'));
    isBulk.set(false);
    store.overrideSelector(selectProjectFeatureState, projects(false));
    store.refreshState();
    actions$.next(done('goal'));

    expect(snack.open).not.toHaveBeenCalled();
  });

  it('cleans up screenshot files after a local project delete', () => {
    actions$.next(
      TaskSharedActions.deleteProject({ projectId: 'p1', noteIds: [], allTaskIds: [] }),
    );
    expect(layerService.deleteOrphanedImages).toHaveBeenCalledTimes(1);
  });

  describe('after a focus session', () => {
    const sessionDone = (): void =>
      actions$.next(completeFocusSession({ isManual: true }));

    it('asks "Name the layer" when the project opted in', () => {
      store.overrideSelector(selectProjectFeatureState, projects(true, true));
      store.overrideSelector(selectCurrentTaskId, 'goal');
      store.refreshState();
      sessionDone();
      expect(snack.open).toHaveBeenCalledTimes(1);
      (snack.open.calls.mostRecent().args[0] as SnackParams).actionFn!();
      expect(layerService.openAddLayerDialog).toHaveBeenCalledOnceWith('p1');
    });

    it('falls back to the paused goal', () => {
      store.overrideSelector(selectProjectFeatureState, projects(true, true));
      store.overrideSelector(selectPausedTaskId, 'goal');
      store.refreshState();
      sessionDone();
      expect(snack.open).toHaveBeenCalledTimes(1);
    });

    it('stays quiet unless the project opted in (off by default)', () => {
      store.overrideSelector(selectCurrentTaskId, 'goal');
      store.refreshState();
      sessionDone();
      expect(snack.open).not.toHaveBeenCalled();
    });
  });
});
