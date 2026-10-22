import { computed, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { IS_ELECTRON } from '../../app.constants';
import { IPC } from '../../../../electron/shared-with-frontend/ipc-events.const';
import {
  FocusWidgetAction,
  FocusWidgetLabels,
  FocusWidgetState,
  parseFocusWidgetAction,
} from '../../../../electron/shared-with-frontend/focus-widget.model';
import {
  selectCurrentScreen,
  selectIsInOvertime,
  selectIsOverlayShown,
  selectIsSessionPaused,
  selectMode,
  selectPausedTaskId,
  selectTimer,
} from './store/focus-mode.selectors';
import {
  selectCurrentTaskId,
  selectLastCurrentTask,
  selectTaskEntities,
} from '../tasks/store/task.selectors';
import { selectAllLayers } from '../layer/store/layer.selectors';
import { selectProjectFeatureState } from '../project/store/project.selectors';
import { FocusModeMode, FocusScreen, TimerState } from './focus-mode.model';
import { FocusSessionControlService } from './focus-session-control.service';
import { LayerImageService } from '../layer/layer-image.service';
import { Log } from '../../core/log';
import { T } from '../../t.const';

const MODE_LABEL_KEYS: Record<FocusModeMode, string> = {
  [FocusModeMode.Flowtime]: T.F.FOCUS_MODE.FLOWTIME,
  [FocusModeMode.Pomodoro]: T.F.FOCUS_MODE.POMODORO,
  [FocusModeMode.Countdown]: T.F.FOCUS_MODE.COUNTDOWN,
};

/** Which focus phase the widget shows, or null for its plain task layout. */
export const getFocusWidgetPhase = (
  timer: TimerState | undefined,
  screen: FocusScreen | undefined,
  isOverlayShown: boolean,
): FocusWidgetState['phase'] | null => {
  if (timer?.purpose === 'work') return 'work';
  if (timer?.purpose === 'break') return 'break';
  if (screen === FocusScreen.SessionDone && isOverlayShown) return 'done';
  return null;
};

/**
 * App side of the floating focus window (v3.2, desktop only): sends the
 * running session to the Task widget and runs the widget's buttons through
 * the same controls as the focus screen.
 */
@Injectable({
  providedIn: 'root',
})
export class FocusWidgetService {
  private _store = inject(Store);
  private _injector = inject(Injector);
  private _translateService = inject(TranslateService);
  private _control = inject(FocusSessionControlService);

  private _timer = this._store.selectSignal(selectTimer);
  private _mode = this._store.selectSignal(selectMode);
  private _screen = this._store.selectSignal(selectCurrentScreen);
  private _isOverlayShown = this._store.selectSignal(selectIsOverlayShown);
  private _isPaused = this._store.selectSignal(selectIsSessionPaused);
  private _isInOvertime = this._store.selectSignal(selectIsInOvertime);
  private _currentTaskId = this._store.selectSignal(selectCurrentTaskId);
  private _pausedTaskId = this._store.selectSignal(selectPausedTaskId);
  private _lastCurrentTask = this._store.selectSignal(selectLastCurrentTask);
  private _taskEntities = this._store.selectSignal(selectTaskEntities);
  private _layers = this._store.selectSignal(selectAllLayers);
  private _projects = this._store.selectSignal(selectProjectFeatureState);

  /** Flowtime pause = break; when it started (display only, never stored). */
  private _breakStartedAt = signal<number | null>(null);
  private _isInitialized = false;
  private _lastImageId: string | null | undefined = undefined;

  private readonly _phase = computed(() =>
    getFocusWidgetPhase(this._timer(), this._screen(), this._isOverlayShown()),
  );

  private readonly _goal = computed(() => {
    const id = this._currentTaskId() ?? this._pausedTaskId();
    return (id ? this._taskEntities()[id] : undefined) ?? this._lastCurrentTask() ?? null;
  });

  private readonly _layer = computed(() => {
    const goalId = this._goal()?.id;
    return goalId ? (this._layers().find((l) => l.focusTaskId === goalId) ?? null) : null;
  });

  private readonly _isFlowtimePause = computed(
    () =>
      this._phase() === 'work' &&
      this._mode() === FocusModeMode.Flowtime &&
      this._isPaused(),
  );

  readonly state = computed((): FocusWidgetState | null => {
    const phase = this._phase();
    if (!phase) return null;
    const timer = this._timer();
    const goal = this._goal();
    const layer = this._layer();
    const mode = this._mode();
    const project = goal?.projectId ? this._projects()?.entities[goal.projectId] : null;
    return {
      phase,
      goalTitle: goal?.title ?? '',
      contextTitle: layer?.title ?? project?.title ?? '',
      isLayer: !!layer,
      modeLabel: this._t(
        phase === 'break' ? T.F.FOCUS_MODE.BREAK_TITLE : MODE_LABEL_KEYS[mode],
      ),
      isCountdown:
        phase === 'break' ||
        (phase === 'work' && mode !== FocusModeMode.Flowtime && !this._isInOvertime()),
      isRunning: timer.isRunning,
      elapsedMs: timer.elapsed,
      durationMs: timer.duration,
      sentAt: Date.now(),
      breakStartedAt: this._breakStartedAt(),
      canLogBreak: phase === 'work' && mode === FocusModeMode.Flowtime,
      labels: this._labels(),
    };
  });

  /** Starts syncing with the widget. Desktop app only; safe to call twice. */
  init(): void {
    if (!IS_ELECTRON || this._isInitialized || !window.ea) return;
    this._isInitialized = true;
    const injector = this._injector;

    effect(
      () => {
        const isFlowtimePause = this._isFlowtimePause();
        const startedAt = this._breakStartedAt();
        if (isFlowtimePause && startedAt === null) {
          this._breakStartedAt.set(Date.now());
        } else if (!isFlowtimePause && startedAt !== null) {
          this._breakStartedAt.set(null);
        }
      },
      { injector },
    );
    effect(() => window.ea.updateFocusWidget(this.state()), { injector });
    effect(() => void this._sendImage(this._layer()?.imageId ?? null), { injector });

    window.ea.on(IPC.FOCUS_WIDGET_ACTION, (raw: unknown) => {
      const action = parseFocusWidgetAction(raw);
      if (action) void this.handleAction(action);
    });
  }

  popOut(): void {
    if (IS_ELECTRON && window.ea) {
      window.ea.popOutFocusWidget();
    }
  }

  async handleAction(action: FocusWidgetAction): Promise<void> {
    switch (action.action) {
      case 'toggle':
        return this._control.toggle();
      case 'complete':
        return this._control.complete();
      case 'cancel':
        return this._control.cancel();
      case 'skipBreak':
        return this._control.skipBreak();
      case 'logBreak':
        return this._control.logBreak(action.minutes * 60000);
    }
  }

  /** The layer's thumbnail as a data URL; only re-sent when the image changes. */
  private async _sendImage(imageId: string | null): Promise<void> {
    if (imageId === this._lastImageId) return;
    this._lastImageId = imageId;
    let dataUrl: string | null = null;
    if (imageId) {
      try {
        // Resolved on use: Layers is optional and not a start-up dependency.
        const url = await this._injector.get(LayerImageService).resolveThumbnail(imageId);
        dataUrl = url ? await blobUrlToDataUrl(url) : null;
      } catch (e) {
        Log.err('FocusWidgetService: could not read the layer thumbnail', e);
      }
    }
    if (imageId === this._lastImageId) {
      window.ea.updateFocusWidgetImage(dataUrl);
    }
  }

  private _t(key: string, params?: Record<string, string>): string {
    return this._translateService.instant(key, params);
  }

  private _labels(): FocusWidgetLabels {
    const F = T.F.FOCUS_MODE;
    return {
      pause: this._t(F.PAUSE_SESSION),
      resume: this._t(F.RESUME_SESSION),
      logBreak: this._t(F.LOG_BREAK),
      complete: this._t(F.COMPLETE_FOCUS_SESSION),
      cancel: this._t(F.CANCEL_SESSION),
      skipBreak: this._t(F.SKIP_BREAK),
      openMain: this._t(F.WIDGET_OPEN_MAIN),
      onBreak: this._t(F.ON_BREAK),
      // The widget fills in the live time.
      cancelConfirm: this._t(F.WIDGET_CANCEL_CONFIRM, { time: '%TIME%' }),
      discard: this._t(F.D_CANCEL_SESSION_OK),
      keep: this._t(F.WIDGET_KEEP),
      logBreakQuestion: this._t(F.WIDGET_LOG_BREAK),
      minutes: this._t(F.WIDGET_MINUTES),
      subtract: this._t(F.D_LOG_BREAK_OK),
      close: this._t(T.G.CANCEL),
      sessionDone: this._t(F.SESSION_COMPLETED),
    };
  }
}

const blobUrlToDataUrl = async (url: string): Promise<string | null> => {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};
