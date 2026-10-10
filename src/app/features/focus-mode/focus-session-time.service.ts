import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { TaskService } from '../tasks/task.service';
import { selectTaskEntities } from '../tasks/store/task.selectors';
import { DateService } from '../../core/date/date.service';
import { getDbDateStr } from '../../util/get-db-date-str';

/**
 * Takes tracked time back off a task: a cancelled focus session, or a break the
 * user forgot to pause for. Goes through `TaskService.removeTimeSpent`, the
 * generic path that flushes pending tracked time before its own op, so a
 * replay can never add the discarded minutes back.
 */
@Injectable({
  providedIn: 'root',
})
export class FocusSessionTimeService {
  private _store = inject(Store);
  private _taskService = inject(TaskService);
  private _dateService = inject(DateService);

  /**
   * Removes up to `durationMs` from the task: today first, then yesterday (a
   * session can cross midnight). Never below zero. Returns what was removed.
   */
  async discard(taskId: string | null | undefined, durationMs: number): Promise<number> {
    if (!taskId || !(durationMs > 0)) return 0;
    const task = (await firstValueFrom(this._store.select(selectTaskEntities)))[taskId];
    if (!task) return 0;

    // Logical days (start-of-next-day offset applied); setDate keeps DST right.
    const logicalNow = this._dateService.getLogicalTodayDate();
    const today = getDbDateStr(logicalNow);
    logicalNow.setDate(logicalNow.getDate() - 1);
    const yesterday = getDbDateStr(logicalNow);
    let remaining = durationMs;
    for (const day of [today, yesterday]) {
      const onDay = +(task.timeSpentOnDay?.[day] ?? 0) || 0;
      const take = Math.min(onDay, remaining);
      if (take > 0) {
        this._taskService.removeTimeSpent(taskId, take, day);
        remaining -= take;
      }
      if (remaining <= 0) break;
    }
    return durationMs - remaining;
  }
}
