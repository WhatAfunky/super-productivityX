// Get elements
const showMainBtn = document.getElementById('show-main') as HTMLButtonElement;
const container = document.getElementById('task-widget-container') as HTMLDivElement;
const taskTitle = document.getElementById('task-title') as HTMLDivElement;
const timeDisplay = document.getElementById('time-display') as HTMLDivElement;

// ── Right-click prevention ──
const blockRightClick = (e: MouseEvent): false | void => {
  if (e.type === 'contextmenu' || e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
};
document.addEventListener('contextmenu', blockRightClick, true);
document.addEventListener('mousedown', blockRightClick, true);
document.addEventListener('mouseup', blockRightClick, true);

// ── Show main button ──
showMainBtn.addEventListener('click', () => {
  window.taskWidgetAPI.showMainWindow();
});

// ── Content updates ──
window.taskWidgetAPI.onUpdateContent((data) => {
  container.classList.remove('mode-pomodoro', 'mode-focus', 'mode-task', 'mode-idle');
  if (data.mode) {
    container.classList.add(`mode-${data.mode}`);
  }
  taskTitle.textContent = data.title || 'No active task';
  timeDisplay.textContent = data.time || '--:--';
});

// ── Opacity updates ──
window.taskWidgetAPI.onUpdateOpacity((opacity) => {
  document.body.style.setProperty('--opacity', opacity.toString());
});

// ── Responsive class + scale updates ──
const REFERENCE_HEIGHT = 80;
const BP_FULL = 80;

const updateResponsiveState = (): void => {
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;

  document.body.classList.remove('size-full', 'size-tiny');
  if (w >= BP_FULL) {
    document.body.classList.add('size-full');
  } else {
    document.body.classList.add('size-tiny');
  }

  const scale = Math.max(0.8, Math.min(2, h / REFERENCE_HEIGHT));
  document.body.style.setProperty('--scale', scale.toString());
};

const resizeObserver = new ResizeObserver(updateResponsiveState);
resizeObserver.observe(document.documentElement);
updateResponsiveState();

// ── Floating focus window (v3.2) ─────────────────────────────────────────────
// No imports here: this file runs as a plain <script>, so types come from the
// global `taskWidgetAPI` declaration.
type FocusState = NonNullable<
  Parameters<Parameters<Window['taskWidgetAPI']['onUpdateFocus']>[0]>[0]
>;
type FocusAction = Parameters<Window['taskWidgetAPI']['focusAction']>[0];

const focusEl = document.getElementById('focus-widget') as HTMLDivElement;
const fwThumb = document.getElementById('fw-thumb') as HTMLImageElement;
const fwContext = document.getElementById('fw-context') as HTMLDivElement;
const fwGoal = document.getElementById('fw-goal') as HTMLDivElement;
const fwBreak = document.getElementById('fw-break') as HTMLDivElement;
const fwClock = document.getElementById('fw-clock') as HTMLDivElement;
const fwMode = document.getElementById('fw-mode') as HTMLDivElement;
const fwButtons = document.getElementById('fw-buttons') as HTMLDivElement;
const fwInline = document.getElementById('fw-inline') as HTMLDivElement;

const FW_ICONS: Record<string, string> = {
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  logBreak:
    '<svg viewBox="0 0 24 24"><path d="M4 19h14v2H4zM18 7h-1V5H3v8a5 5 0 0 0 5 5h4a5 5 0 0 0 5-5v-1h1a3 3 0 0 0 0-6zm0 4h-1V9h1a1 1 0 0 1 0 2z"/></svg>',
  complete:
    '<svg viewBox="0 0 24 24"><path d="M18 7l-1.4-1.4-6.3 6.3 1.4 1.4zm4.2-1.4L11.7 16.2 7.5 12 6.1 13.4l5.6 5.6 12-12zM.4 13.4 6 19l1.4-1.4L1.8 12z"/></svg>',
  cancel:
    '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 14.2A6.2 6.2 0 0 1 7.1 8.4l8.5 8.5A6.2 6.2 0 0 1 12 18.2zm4.9-2.6L8.4 7.1a6.2 6.2 0 0 1 8.5 8.5zM9 1h6v2H9z"/></svg>',
  skipBreak: '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6zM16 6h2v12h-2z"/></svg>',
  openMain:
    '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3z"/></svg>',
};

let fwState: FocusState | null = null;
let fwImage: string | null = null;
let fwInlineKind: 'cancel' | 'logBreak' | null = null;
let fwButtonsKey = '';

const fwFormat = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const fwElapsed = (s: FocusState): number =>
  s.isRunning ? s.elapsedMs + (Date.now() - s.sentAt) : s.elapsedMs;

const fwSend = (action: FocusAction): void => window.taskWidgetAPI.focusAction(action);

const fwCloseInline = (): void => {
  fwInlineKind = null;
  fwInline.hidden = true;
  fwInline.replaceChildren();
};

const fwButton = (label: string, cls: string, onClick: () => void): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
};

const fwOpenInline = (kind: 'cancel' | 'logBreak'): void => {
  if (!fwState) return;
  const l = fwState.labels;
  fwInlineKind = kind;
  fwInline.replaceChildren();
  const text = document.createElement('div');
  const actions = document.createElement('div');
  actions.className = 'fw-inline-actions';
  if (kind === 'cancel') {
    text.textContent = l.cancelConfirm.replace('%TIME%', fwFormat(fwElapsed(fwState)));
    actions.append(
      fwButton(l.keep, 'fw-tb', fwCloseInline),
      fwButton(l.discard, 'fw-tb fw-danger', () => {
        fwSend({ action: 'cancel' });
        fwCloseInline();
      }),
    );
    fwInline.append(text, actions);
  } else {
    text.textContent = l.logBreakQuestion + ' ';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.value = '15';
    const unit = document.createElement('span');
    unit.textContent = ' ' + l.minutes;
    const submit = (): void => {
      const minutes = Number(input.value);
      if (minutes > 0) fwSend({ action: 'logBreak', minutes });
      fwCloseInline();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') fwCloseInline();
    });
    text.append(input, unit);
    actions.append(
      fwButton(l.close, 'fw-tb', fwCloseInline),
      fwButton(l.subtract, 'fw-tb fw-primary', submit),
    );
    fwInline.append(text, actions);
    setTimeout(() => input.select(), 0);
  }
  fwInline.hidden = false;
};

const fwRenderButtons = (s: FocusState): void => {
  const paused = !s.isRunning;
  const l = s.labels;
  const list: [string, string, () => void, boolean?][] = [];
  if (s.phase === 'work' || s.phase === 'break') {
    list.push([
      paused ? 'play' : 'pause',
      paused ? l.resume : l.pause,
      () => fwSend({ action: 'toggle' }),
      true,
    ]);
  }
  if (s.phase === 'work') {
    if (s.canLogBreak)
      list.push(['logBreak', l.logBreak, () => fwOpenInline('logBreak')]);
    list.push(['complete', l.complete, () => fwSend({ action: 'complete' })]);
    list.push(['cancel', l.cancel, () => fwOpenInline('cancel')]);
  }
  if (s.phase === 'break') {
    list.push(['skipBreak', l.skipBreak, () => fwSend({ action: 'skipBreak' })]);
  }
  list.push(['openMain', l.openMain, () => window.taskWidgetAPI.showMainWindow()]);

  // Only rebuild when the set of buttons changes (keeps hover/focus stable).
  const key = list.map(([icon, label]) => icon + label).join('|');
  if (key === fwButtonsKey) return;
  fwButtonsKey = key;
  fwButtons.replaceChildren(
    ...list.map(([icon, label, onClick, isPrimary]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fw-ib' + (isPrimary ? ' fw-primary' : '');
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = FW_ICONS[icon];
      b.addEventListener('click', onClick);
      return b;
    }),
  );
};

const fwRenderClock = (): void => {
  const s = fwState;
  if (!s) return;
  const elapsed = fwElapsed(s);
  fwClock.textContent = fwFormat(
    s.isCountdown ? Math.max(0, s.durationMs - elapsed) : elapsed,
  );
  const isOnBreak = s.breakStartedAt !== null;
  document.body.classList.toggle('fw-on-break', isOnBreak);
  fwBreak.textContent = isOnBreak
    ? `${s.labels.onBreak} · ${fwFormat(Date.now() - (s.breakStartedAt as number))}`
    : s.phase === 'done'
      ? s.labels.sessionDone
      : '';
};

const fwRender = (): void => {
  const s = fwState;
  document.body.classList.toggle('fw-active', !!s);
  container.hidden = !!s;
  focusEl.hidden = !s;
  if (!s) {
    fwCloseInline();
    fwButtonsKey = '';
    return;
  }
  fwContext.textContent = (s.isLayer ? '◆ ' : '') + s.contextTitle;
  fwGoal.textContent = s.goalTitle;
  fwMode.textContent = s.modeLabel;
  fwThumb.hidden = !fwImage;
  if (fwImage) fwThumb.src = fwImage;
  document.body.classList.toggle('fw-no-thumb', !fwImage);
  fwRenderButtons(s);
  if (fwInlineKind === 'logBreak' && !s.canLogBreak) fwCloseInline();
  if (fwInlineKind === 'cancel' && s.phase !== 'work') fwCloseInline();
  fwRenderClock();
};

window.taskWidgetAPI.onUpdateFocus((state) => {
  fwState = state;
  fwRender();
});
window.taskWidgetAPI.onUpdateFocusImage((dataUrl) => {
  fwImage = dataUrl;
  fwRender();
});
setInterval(fwRenderClock, 500);

// Layout by size: A (compact bar) by default, B (card with screenshot) when the
// widget is resized taller; the tiny single row below that.
const fwUpdateLayout = (): void => {
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;
  document.body.classList.toggle('fw-card', h >= 220 && w >= 240);
  document.body.classList.toggle('fw-tiny', h < 96);
};
new ResizeObserver(fwUpdateLayout).observe(document.documentElement);
fwUpdateLayout();
