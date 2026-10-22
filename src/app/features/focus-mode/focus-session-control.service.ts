import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  cancelFocusSession,
  completeFocusSession,
  endFlowtimeSession,
  logFlowtimeBreak,
  pauseFocusSession,
  skipBreak,
  unPauseFocusSession,
} from './store/focus-mode.actions';
import { selectPausedTaskId } from './store/focus-mode.selectors';
import { FocusModeMode } from './focus-mode.model';
import { FocusSessionTimeService } from './focus-session-time.service';
import { FocusModeService } from './focus-mode.service';
import { TaskService } from '../tasks/task.service';

/**
 * The session controls shared by the focus screen and the floating focus
 * window (v3.2), so both run exactly the same actions.
 */
@Injectable({
  providedIn: 'root',
})
export class FocusSessionControlService {
  private _store = inject(Store);
  private _sessionTime = inject(FocusSessionTimeService);

  private _focusModeService = inject(FocusModeService);
  private _taskService = inject(TaskService);
  private _pausedTaskId = this._store.selectSignal(selectPausedTaskId);

  /** The task the session is about: tracked now, or paused by focus mode. */
  goalTaskId(): string | null {
    return this._taskService.currentTaskId() ?? this._pausedTaskId();
  }

  pause(): void {
    this._store.dispatch(pauseFocusSession({ pausedTaskId: this.goalTaskId() }));
  }

  resume(): void {
    this._store.dispatch(unPauseFocusSession());
  }

  toggle(): void {
    if (this._focusModeService.isSessionPaused()) {
      this.resume();
    } else {
      this.pause();
    }
  }

  complete(): void {
    if (this._focusModeService.mode() === FocusModeMode.Flowtime) {
      // Flowtime ends through its own action, which offers the break.
      this._store.dispatch(
        endFlowtimeSession({ pausedTaskId: this._taskService.currentTaskId() }),
      );
      return;
    }
    this._store.dispatch(completeFocusSession({ isManual: true }));
  }

  /** Ends the session and takes the time it tracked back off its goal. */
  async cancel(
    taskId: string | null = this.goalTaskId(),
    elapsedMs: number = this._focusModeService.timeElapsed(),
  ): Promise<void> {
    // Stop first: tracking stops and flushes its pending time, so the discard
    // below covers everything this session tracked.
    this._store.dispatch(cancelFocusSession());
    await this._sessionTime.discard(taskId, elapsedMs);
  }

  /** Flowtime: subtract a break the user forgot to pause for. */
  async logBreak(
    amountMs: number,
    taskId: string | null = this.goalTaskId(),
  ): Promise<void> {
    // Capped at the session's elapsed time, like the clock itself.
    const capped = Math.min(amountMs, this._focusModeService.timeElapsed());
    if (!(capped > 0)) return;
    this._store.dispatch(logFlowtimeBreak({ amountMs: capped }));
    await this._sessionTime.discard(taskId, capped);
  }

  skipBreak(): void {
    this._store.dispatch(skipBreak({ pausedTaskId: this.goalTaskId() }));
  }
}
