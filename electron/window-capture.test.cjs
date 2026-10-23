// Auto screenshots (v3.3): the main-process side of window capture.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

require('ts-node/register/transpile-only');

const originalModuleLoad = Module._load;
const modulePath = path.resolve(__dirname, 'window-capture/window-capture.ts');
const modelPath = path.resolve(__dirname, 'shared-with-frontend/window-capture.model.ts');

let windows = [];
let sources = [];
let screenStatus = 'granted';
let ipcHandlers = new Map();
let ipcInvokeHandlers = new Map();
let store = {};

const fakeImage = (bytes = [1, 2, 3], empty = false) => ({
  isEmpty: () => empty,
  toPNG: () => Buffer.from(bytes),
  toDataURL: () => 'data:image/png;base64,AAAA',
});

class FakeWebContents {
  constructor() {
    this.sent = [];
    this._h = new Map();
  }
  on(n, h) {
    this._h.set(n, h);
  }
  emit(n) {
    this._h.get(n)?.();
  }
  send(channel, payload) {
    this.sent.push({ channel, payload });
  }
}

class FakeBrowserWindow {
  constructor(opts = {}) {
    this.opts = opts;
    this.webContents = new FakeWebContents();
    this._h = new Map();
    this._mediaId = `window:${900 + windows.length}:0`;
    this.closed = false;
    windows.push(this);
  }
  static getAllWindows() {
    return windows.filter((w) => !w.closed);
  }
  static fromWebContents(wc) {
    return windows.find((w) => w.webContents === wc) ?? null;
  }
  getMediaSourceId() {
    return this._mediaId;
  }
  loadFile() {}
  on(n, h) {
    this._h.set(n, h);
  }
  once(n, h) {
    this._h.set(n, h);
  }
  removeAllListeners(n) {
    this._h.delete(n);
  }
  isDestroyed() {
    return this.closed;
  }
  show() {}
  close() {
    this.closed = true;
    this._h.get('closed')?.();
  }
}

const install = () => {
  Module._load = function patched(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        desktopCapturer: { getSources: async () => sources },
        systemPreferences: { getMediaAccessStatus: () => screenStatus },
        shell: { openExternal: async () => {} },
        ipcMain: {
          on: (c, h) => ipcHandlers.set(c, h),
          handle: (c, h) => ipcInvokeHandlers.set(c, h),
        },
      };
    }
    if (request === 'electron-log/main') return { info: () => {}, error: () => {} };
    if (request.endsWith('simple-store')) {
      return {
        loadSimpleStoreAll: async () => store,
        saveSimpleStore: async (k, v) => {
          store = { ...store, [k]: v };
        },
      };
    }
    if (request.endsWith('common.const')) return { IS_MAC: true };
    if (request.endsWith('web-preferences-guard'))
      return { assertSecureWebPreferences: () => {} };
    return originalModuleLoad.call(this, request, parent, isMain);
  };
};

const load = () => {
  delete require.cache[modulePath];
  return require(modulePath);
};
const flush = () => new Promise((r) => setImmediate(r));
const LABELS = {
  title: 'Pick',
  hint: '',
  refresh: '',
  cancel: '',
  use: '',
  empty: '',
  permission: '',
  openSettings: '',
};

test.beforeEach(() => {
  windows = [];
  sources = [];
  screenStatus = 'granted';
  ipcHandlers = new Map();
  ipcInvokeHandlers = new Map();
  store = {};
  install();
});
test.afterEach(() => {
  Module._load = originalModuleLoad;
});

const pick = async (mod, id) => {
  const main = new FakeBrowserWindow();
  mod.initWindowCaptureIpc();
  const picked = ipcInvokeHandlers.get('CAPTURE_PICK_WINDOW')(
    { sender: main.webContents },
    LABELS,
  );
  await flush();
  await flush();
  const picker = windows[windows.length - 1];
  picker.webContents.emit('did-finish-load');
  await flush();
  await flush();
  ipcHandlers.get('capture-picker-choose')({ sender: picker.webContents }, id);
  return { result: await picked, main, picker };
};

test('a window that was never picked cannot be captured', async () => {
  const mod = load();
  sources = [{ id: 'window:1:0', name: 'scene_02.moho', thumbnail: fakeImage() }];
  const res = await mod.captureWindow({ id: 'window:1:0', title: 'scene_02.moho' });
  assert.deepEqual(res, { ok: false, reason: 'not-granted' });
});

test("the picker lists other apps' windows only, and its choice becomes a grant", async () => {
  const mod = load();
  sources = [{ id: 'window:1:0', name: 'scene_02.moho', thumbnail: fakeImage() }];
  const { result, main, picker } = await pick(mod, 'window:1:0');
  // Our own windows are never offered.
  sources.push({
    id: main.getMediaSourceId(),
    name: 'Super Productivity',
    thumbnail: fakeImage(),
  });
  const update = picker.webContents.sent.find(
    (s) => s.channel === 'capture-picker-update',
  );
  assert.deepEqual(
    update.payload.sources.map((s) => s.title),
    ['scene_02.moho'],
  );
  assert.deepEqual(result, { id: 'window:1:0', title: 'scene_02.moho' });

  const res = await mod.captureWindow(result);
  assert.equal(res.ok, true);
  assert.deepEqual([...res.png], [1, 2, 3]);
});

test('picker messages from any other window are ignored', async () => {
  const mod = load();
  sources = [{ id: 'window:1:0', name: 'scene_02.moho', thumbnail: fakeImage() }];
  const main = new FakeBrowserWindow();
  mod.initWindowCaptureIpc();
  const picked = ipcInvokeHandlers.get('CAPTURE_PICK_WINDOW')(
    { sender: main.webContents },
    LABELS,
  );
  await flush();
  ipcHandlers.get('capture-picker-choose')({ sender: main.webContents }, 'window:1:0');
  await flush();
  const picker = windows[windows.length - 1];
  assert.equal(picker.closed, false, 'still waiting for the real picker');
  ipcHandlers.get('capture-picker-cancel')({ sender: picker.webContents });
  assert.equal(await picked, null);
});

test('after an app restart the window is re-found by title, and the grant follows it', async () => {
  const mod = load();
  sources = [{ id: 'window:1:0', name: 'scene_02.moho', thumbnail: fakeImage() }];
  const { result } = await pick(mod, 'window:1:0');
  sources = [{ id: 'window:77:0', name: 'scene_02.moho', thumbnail: fakeImage([9]) }];
  const res = await mod.captureWindow(result);
  assert.equal(res.ok, true);
  assert.deepEqual(res.target, { id: 'window:77:0', title: 'scene_02.moho' });
  assert.ok(store.windowCaptureGrants.some((g) => g.id === 'window:77:0'));
});

test('no permission or a closed window gives a reason, not a blank image', async () => {
  const mod = load();
  sources = [{ id: 'window:1:0', name: 'scene_02.moho', thumbnail: fakeImage() }];
  const { result } = await pick(mod, 'window:1:0');
  screenStatus = 'denied';
  assert.deepEqual(await mod.captureWindow(result), { ok: false, reason: 'permission' });
  screenStatus = 'granted';
  sources = [];
  assert.deepEqual(await mod.captureWindow(result), { ok: false, reason: 'not-found' });
});

test('title matching ignores app decorations, and only when unambiguous', () => {
  delete require.cache[modelPath];
  const { findCaptureSource, captureTitleKey } = require(modelPath);
  assert.equal(captureTitleKey('Storyboard_v3.psd @ 33% (RGB/8)'), 'storyboard_v3.psd');
  assert.equal(captureTitleKey('shot_A.blend - Blender 4.2'), 'shot_a.blend');
  const t = { id: 'gone', title: 'Storyboard_v3.psd @ 33%' };
  assert.equal(
    findCaptureSource([{ id: 'a', name: 'Storyboard_v3.psd @ 50%' }], t)?.id,
    'a',
  );
  assert.equal(
    findCaptureSource(
      [
        { id: 'a', name: 'Storyboard_v3.psd @ 50%' },
        { id: 'b', name: 'Storyboard_v3.psd @ 25%' },
      ],
      t,
    ),
    null,
  );
});
