import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { Layer } from './layer.model';
import { updateLayer } from './store/layer.actions';
import { TaskService } from '../tasks/task.service';
import { selectTaskEntities } from '../tasks/store/task.selectors';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { WorkContextType } from '../work-context/work-context.model';
import { showFocusOverlay } from '../focus-mode/store/focus-mode.actions';
import { T } from '../../t.const';
import { GlobalConfigService } from '../config/global-config.service';

/**
 * ▶ on a layer: focus on the layer's goal ("Work on: <title>"). Time is
 * tracked on that goal like on any task; layers get no time of their own.
 */
@Injectable({
  providedIn: 'root',
})
export class LayerFocusService {
  private _store = inject(Store);
  private _taskService = inject(TaskService);
  private _translateService = inject(TranslateService);
  private _globalConfigService = inject(GlobalConfigService);

  async workOn(layer: Layer): Promise<void> {
    const taskId = (await this._openGoalId(layer)) ?? (await this._createGoal(layer));
    this._taskService.setCurrentId(taskId);
    // With focus mode switched off in app features, ▶ just starts tracking.
    if (this._globalConfigService.appFeatures().isFocusModeEnabled) {
      this._store.dispatch(showFocusOverlay());
    }
  }

  /** The linked goal while it is still open; done, archived or gone → null. */
  private async _openGoalId(layer: Layer): Promise<string | null> {
    if (!layer.focusTaskId) return null;
    const entities = await firstValueFrom(this._store.select(selectTaskEntities));
    const task = entities[layer.focusTaskId];
    return task && !task.isDone ? task.id : null;
  }

  /**
   * Two single-entity ops: add the goal, then point the layer at it. Either
   * one alone is still valid state (a plain goal in the project, or a
   * dangling link that the next ▶ replaces), so no meta-reducer is needed.
   */
  private async _createGoal(layer: Layer): Promise<string> {
    const task = this._taskService.createNewTaskWithDefaults({
      title: this._translateService.instant(T.F.LAYER.WORK_ON_TITLE, {
        title: layer.title,
      }),
      workContextType: WorkContextType.PROJECT,
      workContextId: layer.projectId,
    });
    this._store.dispatch(
      TaskSharedActions.addTask({
        task,
        workContextId: layer.projectId,
        workContextType: WorkContextType.PROJECT,
        isAddToBacklog: false,
        isAddToBottom: false,
        // A layer title is user text, not a command: "#tag" or "@date" in it
        // must stay in the title.
        isIgnoreShortSyntax: true,
      }),
    );
    this._store.dispatch(
      updateLayer({ layer: { id: layer.id, changes: { focusTaskId: task.id } } }),
    );
    // Let the op-log capture both ops before focus mode acts on the task.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return task.id;
  }
}
