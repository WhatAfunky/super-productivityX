import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { Dictionary } from '@ngrx/entity';
import { Layer } from './layer.model';
import { updateLayer } from './store/layer.actions';
import { selectLayersByProjectIdMap } from './store/layer.selectors';
import { Task } from '../tasks/task.model';
import { addSubTask } from '../tasks/store/task.actions';
import { canConvertTaskToSubTask } from '../tasks/util/can-convert-task-to-sub-task';
import { TaskService } from '../tasks/task.service';
import { selectCurrentTaskId, selectTaskEntities } from '../tasks/store/task.selectors';
import { selectPausedTaskId } from '../focus-mode/store/focus-mode.selectors';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { WorkContextType } from '../work-context/work-context.model';
import { showFocusOverlay } from '../focus-mode/store/focus-mode.actions';
import { T } from '../../t.const';
import { GlobalConfigService } from '../config/global-config.service';

/**
 * ▶ on a layer: focus on the layer's goal ("Work on: <title>"). Time is
 * tracked on that goal like on any task; layers get no time of their own.
 */
/**
 * ▶ on a layer: focus on the layer's goal ("Work on: <title>"). Time is
 * tracked on that goal like on any task; layers get no time of their own.
 *
 * Goals are subtasks of one "Layers" parent task per project, so the task
 * list shows one row instead of one per layer; subtasks keep their own time.
 * Every step is one single-entity op (add the parent, fold an old goal in,
 * add the goal, point the layer at it); a partial apply leaves valid state: a
 * plain parent, a goal still at the top level, or a dangling link that the
 * next ▶ replaces.
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
    // Goals made before the parent existed (or on a device without it) move
    // under it; afterwards there is nothing left to move.
    await this._foldGoals(layer.projectId);
    // Already this layer's session (tracking, or paused by focus mode): only
    // bring focus mode back. Setting it current again would resume a pause.
    const [currentId, pausedId] = await Promise.all([
      firstValueFrom(this._store.select(selectCurrentTaskId)),
      firstValueFrom(this._store.select(selectPausedTaskId)),
    ]);
    if (taskId !== currentId && taskId !== pausedId) {
      this._taskService.setCurrentId(taskId);
    }
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

  private async _createGoal(layer: Layer): Promise<string> {
    const { entities, layers } = await this._snapshot(layer.projectId);
    const parentId =
      findLayerGoalParentId(layer.projectId, layers, entities) ??
      this._addGoalParent(layer.projectId);
    const task = this._taskService.createNewTaskWithDefaults({
      title: this._translateService.instant(T.F.LAYER.WORK_ON_TITLE, {
        title: layer.title,
      }),
      workContextType: WorkContextType.PROJECT,
      workContextId: layer.projectId,
    });
    this._store.dispatch(
      addSubTask({
        task,
        parentId,
        // A layer title is user text, not a command: "#tag" or "@date" in it
        // must stay in the title.
        isIgnoreShortSyntax: true,
      }),
    );
    this._store.dispatch(
      updateLayer({ layer: { id: layer.id, changes: { focusTaskId: task.id } } }),
    );
    await yieldForPersistence();
    return task.id;
  }

  /** Moves the project's open top-level layer goals under its "Layers" parent. */
  private async _foldGoals(projectId: string): Promise<void> {
    const { entities, layers } = await this._snapshot(projectId);
    const goalIds = foldableLayerGoalIds(projectId, layers, entities);
    if (!goalIds.length) return;
    const parentId =
      findLayerGoalParentId(projectId, layers, entities) ??
      this._addGoalParent(projectId);
    for (const taskId of goalIds) {
      this._store.dispatch(
        TaskSharedActions.convertToSubTask({
          taskId,
          targetParentId: parentId,
          afterTaskId: null,
        }),
      );
    }
    await yieldForPersistence();
  }

  private _addGoalParent(projectId: string): string {
    const parent = this._taskService.createNewTaskWithDefaults({
      title: this._translateService.instant(T.F.LAYER.GOAL_PARENT_TITLE),
      workContextType: WorkContextType.PROJECT,
      workContextId: projectId,
    });
    this._store.dispatch(
      TaskSharedActions.addTask({
        task: parent,
        workContextId: projectId,
        workContextType: WorkContextType.PROJECT,
        isAddToBacklog: false,
        isAddToBottom: false,
        isIgnoreShortSyntax: true,
      }),
    );
    return parent.id;
  }

  private async _snapshot(
    projectId: string,
  ): Promise<{ entities: Dictionary<Task>; layers: readonly Layer[] }> {
    const [entities, layers] = await Promise.all([
      firstValueFrom(this._store.select(selectTaskEntities)),
      firstValueFrom(
        this._store
          .select(selectLayersByProjectIdMap)
          .pipe(map((m) => m.get(projectId) ?? [])),
      ),
    ]);
    return { entities, layers };
  }
}

/** Let the op-log capture a run of dispatches (AGENTS.md rule 6). */
const yieldForPersistence = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The project's "Layers" parent: the open, top-level parent of any layer
 * goal. Derived, so nothing new is stored; null when there is none yet.
 */
export const findLayerGoalParentId = (
  projectId: string,
  layers: readonly Layer[],
  entities: Dictionary<Task>,
): string | null => {
  for (const l of layers) {
    const goal = l.focusTaskId ? entities[l.focusTaskId] : undefined;
    const parent = goal?.parentId ? entities[goal.parentId] : undefined;
    if (parent && !parent.isDone && !parent.parentId && parent.projectId === projectId) {
      return parent.id;
    }
  }
  return null;
};

/** Open layer goals still at the top level of the project's task list. */
export const foldableLayerGoalIds = (
  projectId: string,
  layers: readonly Layer[],
  entities: Dictionary<Task>,
): string[] => {
  const ids = new Set<string>();
  for (const l of layers) {
    const goal = l.focusTaskId ? entities[l.focusTaskId] : undefined;
    if (
      goal &&
      !goal.isDone &&
      goal.projectId === projectId &&
      canConvertTaskToSubTask(goal)
    ) {
      ids.add(goal.id);
    }
  }
  return [...ids];
};
