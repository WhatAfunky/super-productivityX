// Floating focus window (v3.2): the Task widget's pop-out and focus channel.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

require('ts-node/register/transpile-only');

const originalModuleLoad = Module._load;
const taskWidgetModulePath = path.resolve(__dirname, 'task-widget/task-widget.ts');

let createdWindows = [];
let ipcHandlers = new Map();

class FakeWebContents {
  constructor() {
    this.sent = [];
    this._handlers = new Map();
  }
  on(eventName, handler) {
    this._handlers.set(eventName, handler);
  }
  emit(eventName) {
    const handler = this._handlers.get(eventName);
    if (handler) handler();
  }
  send(channel, payload) {
    this.sent.push({ channel, payload });
  }
  focus() {}
  isDestroyed() {
    return false;
  }
  removeAllListeners() {}
}

class FakeBrowserWindow {
  constructor(opts = {}) {
    this.opts = opts;
    this._visible = false;
    this._bounds = { width: opts.width ?? 300, height: opts.height ?? 80, x: 0, y: 0 };
    this._handlers = new Map();
    this.webContents = new FakeWebContents();
    createdWindows.push(this);
  }
  static getAllWindows() {
    return createdWindows.slice();
  }
  static fromWebContents(wc) {
    return createdWindows.find((w) => w.webContents === wc) ?? null;
  }
  loadFile() {}
  setVisibleOnAllWorkspaces() {}
  setOpacity() {}
  setClosable() {}
  removeAllListeners() {}
  destroy() {}
  on(eventName, handler) {
    this._handlers.set(eventName, handler);
  }
  getBounds() {
    return { ...this._bounds };
  }
  setBounds(b) {
    this._bounds = { ...this._bounds, ...b };
  }
  isDestroyed() {
    return false;
  }
  isVisible() {
    return this._visible;
  }
  show() {
    this._visible = true;
  }
  showInactive() {
    this._visible = true;
  }
  hide() {
    this._visible = false;
  }
  restore() {}
  focus() {}
}

const installMocks = () => {
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        ipcMain: {
          on: (channel, handler) => ipcHandlers.set(channel, handler),
          removeAllListeners: (channel) => ipcHandlers.delete(channel),
        },
        screen: {
          getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
          getDisplayMatching: () => ({
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          }),
        },
      };
    }
    if (request === 'electron-log/main') return { info: () => {} };
    if (request.endsWith('simple-store')) {
      return { loadSimpleStoreAll: async () => ({}), saveSimpleStore: () => {} };
    }
    if (request.endsWith('common.const')) return { IS_MAC: false };
    return originalModuleLoad.call(this, request, parent, isMain);
  };
};

const loadModule = () => {
  delete require.cache[taskWidgetModulePath];
  return require(taskWidgetModulePath);
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

const STATE = {
  phase: 'work',
  goalTitle: 'Work on: Storyboard',
  contextTitle: 'Storyboard',
  isLayer: true,
  modeLabel: 'Flowtime',
  isCountdown: false,
  isRunning: true,
  elapsedMs: 1000,
  durationMs: 0,
  sentAt: 0,
  breakStartedAt: null,
  canLogBreak: true,
  labels: {},
};

test.beforeEach(() => {
  createdWindows = [];
  ipcHandlers = new Map();
  installMocks();
});
test.afterEach(() => {
  Module._load = originalModuleLoad;
});

test('pop-out shows the widget even with the Task widget setting off, and hides the main window', async () => {
  const mod = loadModule();
  const main = new FakeBrowserWindow();
  main.show();
  mod.popOutFocusWidget(main);
  await flush();
  await flush();

  const widget = createdWindows.find((w) => w !== main);
  assert.ok(widget, 'the widget window is created');
  assert.equal(widget.isVisible(), true, 'the widget is shown');
  assert.equal(main.isVisible(), false, 'the main window is hidden, not closed');
  const b = widget.getBounds();
  assert.ok(b.width >= 320 && b.height >= 112, 'grown to fit the compact focus layout');
  assert.equal(mod.getIsFocusPopOut(), true);
});

test('showing the main window again ends the pop-out and hides the widget', async () => {
  const mod = loadModule();
  const main = new FakeBrowserWindow();
  mod.popOutFocusWidget(main);
  await flush();
  await flush();
  const widget = createdWindows.find((w) => w !== main);

  mod.hideTaskWidget();
  assert.equal(mod.getIsFocusPopOut(), false);
  assert.equal(widget.isVisible(), false);
  // Without the setting, the main window hiding no longer brings it back.
  mod.showTaskWidget();
  assert.equal(widget.isVisible(), false);
});

test('focus state is cached and re-sent once the widget page has loaded', async () => {
  const mod = loadModule();
  mod.updateFocusWidgetState(STATE);
  mod.updateFocusWidgetImage('data:image/webp;base64,AAAA');
  const main = new FakeBrowserWindow();
  mod.popOutFocusWidget(main);
  await flush();
  await flush();
  const widget = createdWindows.find((w) => w !== main);

  widget.webContents.sent = [];
  widget.webContents.emit('did-finish-load');
  const channels = widget.webContents.sent.map((s) => s.channel);
  assert.ok(channels.includes('update-focus'));
  assert.ok(channels.includes('update-focus-image'));
  assert.deepEqual(
    widget.webContents.sent.find((s) => s.channel === 'update-focus').payload,
    STATE,
  );
});

test('only data:image URLs are accepted as the thumbnail', () => {
  const mod = loadModule();
  const main = new FakeBrowserWindow();
  mod.popOutFocusWidget(main);
  return flush().then(async () => {
    await flush();
    const widget = createdWindows.find((w) => w !== main);
    widget.webContents.sent = [];
    mod.updateFocusWidgetImage('file:///etc/passwd');
    assert.equal(widget.webContents.sent.at(-1).payload, null);
  });
});

test('widget buttons are validated and forwarded to the main window only', async () => {
  const mod = loadModule();
  mod.initFocusWidgetListeners();
  const main = new FakeBrowserWindow();
  mod.popOutFocusWidget(main);
  await flush();
  await flush();
  const widget = createdWindows.find((w) => w !== main);
  const handler = ipcHandlers.get('task-widget-focus-action');
  assert.ok(handler, 'listener registered');

  handler({ sender: widget.webContents }, { action: 'logBreak', minutes: 15 });
  handler({ sender: widget.webContents }, { action: 'rm -rf' });
  handler({ sender: main.webContents }, { action: 'toggle' }); // not from the widget

  const forwarded = main.webContents.sent.filter(
    (s) => s.channel === 'FOCUS_WIDGET_ACTION',
  );
  assert.deepEqual(
    forwarded.map((s) => s.payload),
    [{ action: 'logBreak', minutes: 15 }],
  );
});
