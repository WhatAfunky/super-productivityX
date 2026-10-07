import { inject, Injectable } from '@angular/core';
import { createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { filter, map, tap, withLatestFrom } from 'rxjs/operators';
import { LOCAL_ACTIONS } from '../../../util/local-actions.token';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { selectTaskEntities } from '../../tasks/store/task.selectors';
import { selectProjectFeatureState } from '../../project/store/project.selectors';
import { TaskMultiSelectService } from '../../tasks/task-multi-select.service';
import { SnackService } from '../../../core/snack/snack.service';
import { LayerService } from '../layer.service';
import { IS_LAYERS_PLATFORM_SUPPORTED } from '../layer.util';
import { T } from '../../../t.const';

@Injectable()
export class LayerUiEffects {
  // LOCAL_ACTIONS: a goal completed on another device, or replayed from the
  // op-log, must never pop a snack here.
  private _actions$ = inject(LOCAL_ACTIONS);
  private _store = inject(Store);
  private _snackService = inject(SnackService);
  private _layerService = inject(LayerService);
  private _taskMultiSelectService = inject(TaskMultiSelectService);

  /**
   * Completing a goal/task in a Layers project offers — never forces — to
   * name what now exists. Top-level goals only; a bulk "mark done" stays quiet.
   */
  offerLayerOnGoalDone$ = createEffect(
    () =>
      this._actions$.pipe(
        ofType(TaskSharedActions.updateTask),
        filter(() => IS_LAYERS_PLATFORM_SUPPORTED),
        filter(({ task: { changes } }) => changes.isDone === true),
        filter(() => !this._taskMultiSelectService.isBulkFeedbackSuppressed()),
        withLatestFrom(
          this._store.select(selectTaskEntities),
          this._store.select(selectProjectFeatureState),
        ),
        map(([{ task }, taskEntities, projectState]) => {
          const done = taskEntities[task.id as string];
          if (!done || done.parentId || !done.projectId) return null;
          return projectState.entities[done.projectId]?.isLayersEnabled
            ? done.projectId
            : null;
        }),
        filter((projectId): projectId is string => !!projectId),
        tap((projectId) =>
          this._snackService.open({
            msg: T.F.LAYER.GOAL_DONE_SNACK,
            ico: 'layers',
            actionStr: T.F.LAYER.NAME_THE_LAYER,
            actionFn: () => void this._layerService.openAddLayerDialog(projectId),
          }),
        ),
      ),
    { dispatch: false },
  );
}
