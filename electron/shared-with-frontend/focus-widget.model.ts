/**
 * Floating focus window (v3.2): the Task widget's focus layout.
 * The app (main window renderer) sends a snapshot of the running session;
 * the widget renders it and ticks its clock locally between snapshots.
 */
export interface FocusWidgetState {
  /** 'work' session, a 'break', or a just-completed session ('done'). */
  phase: 'work' | 'break' | 'done';
  /** The goal/task being worked on. */
  goalTitle: string;
  /** Second line: the layer's title, else the project's. */
  contextTitle: string;
  /** True when the second line is a layer (shown with a layer marker). */
  isLayer: boolean;
  /** "Flowtime", "Pomodoro", "Countdown", "Break"… (translated). */
  modeLabel: string;
  /** Countdown clock (time left) instead of counting up. */
  isCountdown: boolean;
  isRunning: boolean;
  elapsedMs: number;
  durationMs: number;
  /** Date.now() when this snapshot was taken, for local ticking. */
  sentAt: number;
  /** Flowtime pause = break: when it started, else null. */
  breakStartedAt: number | null;
  /** Flowtime work session: offer "log a break". */
  canLogBreak: boolean;
  /** Translated UI strings (the widget has no i18n of its own). */
  labels: FocusWidgetLabels;
}

export interface FocusWidgetLabels {
  pause: string;
  resume: string;
  logBreak: string;
  complete: string;
  cancel: string;
  skipBreak: string;
  openMain: string;
  onBreak: string;
  cancelConfirm: string;
  discard: string;
  keep: string;
  logBreakQuestion: string;
  minutes: string;
  subtract: string;
  close: string;
  sessionDone: string;
}

export type FocusWidgetAction =
  | { action: 'toggle' }
  | { action: 'complete' }
  | { action: 'cancel' }
  | { action: 'skipBreak' }
  | { action: 'logBreak'; minutes: number };

export const FOCUS_WIDGET_ACTIONS: readonly FocusWidgetAction['action'][] = [
  'toggle',
  'complete',
  'cancel',
  'skipBreak',
  'logBreak',
];

/** Validates a widget action coming over IPC; null when malformed. */
export const parseFocusWidgetAction = (raw: unknown): FocusWidgetAction | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { action, minutes } = raw as { action?: unknown; minutes?: unknown };
  if (typeof action !== 'string') return null;
  if (!(FOCUS_WIDGET_ACTIONS as readonly string[]).includes(action)) return null;
  if (action === 'logBreak') {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0 || m > 24 * 60) return null;
    return { action, minutes: Math.round(m) };
  }
  return { action } as FocusWidgetAction;
};

/** Max size of the thumbnail data URL the widget accepts (a 256px WebP is ~30 KB). */
export const FOCUS_WIDGET_MAX_IMAGE_LENGTH = 2 * 1024 * 1024;
