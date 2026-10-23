import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  desktopCapturer,
  ipcMain,
  shell,
  systemPreferences,
} from 'electron';
import { join } from 'path';
import { info, error } from 'electron-log/main';
import { IPC } from '../shared-with-frontend/ipc-events.const';
import {
  CapturePermission,
  CapturePickerLabels,
  CapturePickerSource,
  CaptureResult,
  CaptureTarget,
  findCaptureSource,
  isGrantedCaptureTarget,
} from '../shared-with-frontend/window-capture.model';
import { assertSecureWebPreferences } from '../web-preferences-guard';
import { loadSimpleStoreAll, saveSimpleStore } from '../simple-store';
import { IS_MAC } from '../common.const';

/**
 * Auto screenshots (v3.3). See window-capture.model.ts for the security model:
 * thumbnails of other apps only ever reach the picker window owned here, and a
 * capture is only done for a window the user picked there.
 */

const GRANTS_KEY = 'windowCaptureGrants';
const MAX_GRANTS = 200;
const PICKER_THUMB_SIZE = { width: 320, height: 200 };
/** Captures are scaled to fit this box (aspect ratio kept). */
const CAPTURE_SIZE = { width: 2560, height: 2560 };
const MAC_SCREEN_RECORDING_SETTINGS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

let grants: CaptureTarget[] = [];
let grantsLoaded: Promise<void> | null = null;
let pickerWin: BrowserWindow | null = null;
let pickerResolve: ((target: CaptureTarget | null) => void) | null = null;
let pickerSources: CapturePickerSource[] = [];
let pickerLabels: CapturePickerLabels | null = null;

const loadGrants = (): Promise<void> => {
  if (!grantsLoaded) {
    grantsLoaded = loadSimpleStoreAll()
      .then((store) => {
        const saved = store[GRANTS_KEY];
        if (Array.isArray(saved)) {
          grants = saved.filter(
            (g): g is CaptureTarget =>
              !!g && typeof g.id === 'string' && typeof g.title === 'string',
          );
        }
      })
      .catch(() => undefined);
  }
  return grantsLoaded;
};

const addGrant = (target: CaptureTarget): void => {
  grants = [
    target,
    ...grants.filter((g) => g.id !== target.id && g.title !== target.title),
  ].slice(0, MAX_GRANTS);
  saveSimpleStore(GRANTS_KEY, grants).catch(() => undefined);
};

export const getCapturePermission = (): CapturePermission => {
  if (!IS_MAC) return 'granted';
  const status = systemPreferences.getMediaAccessStatus('screen');
  return status === 'granted' || status === 'denied' || status === 'not-determined'
    ? status
    : 'unknown';
};

/** Media source ids of this app's own windows, which are never offered. */
const ownSourceIds = (): Set<string> =>
  new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));

const listSources = async (): Promise<CapturePickerSource[]> => {
  const own = ownSourceIds();
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: PICKER_THUMB_SIZE,
  });
  return sources
    .filter((s) => !own.has(s.id) && !s.thumbnail.isEmpty() && s.name.trim().length > 0)
    .map((s) => ({ id: s.id, title: s.name, thumbnail: s.thumbnail.toDataURL() }));
};

const sendToPicker = async (): Promise<void> => {
  if (!pickerWin || pickerWin.isDestroyed()) return;
  try {
    pickerSources = await listSources();
  } catch (e) {
    error('window-capture: listing windows failed', e);
    pickerSources = [];
  }
  if (!pickerWin || pickerWin.isDestroyed()) return;
  pickerWin.webContents.send('capture-picker-update', {
    sources: pickerSources,
    labels: pickerLabels,
    permission: getCapturePermission(),
  });
};

const finishPicker = (target: CaptureTarget | null): void => {
  const resolve = pickerResolve;
  pickerResolve = null;
  pickerSources = [];
  if (pickerWin && !pickerWin.isDestroyed()) {
    pickerWin.removeAllListeners('closed');
    pickerWin.close();
  }
  pickerWin = null;
  resolve?.(target);
};

/** Opens the picker; resolves with the chosen window, or null when cancelled. */
export const openCapturePicker = (
  parent: BrowserWindow | null,
  labels: CapturePickerLabels,
): Promise<CaptureTarget | null> => {
  if (pickerWin && !pickerWin.isDestroyed()) finishPicker(null);
  pickerLabels = labels;

  const webPreferences: BrowserWindowConstructorOptions['webPreferences'] = {
    preload: join(__dirname, 'capture-picker-preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    disableDialogs: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
  };
  assertSecureWebPreferences(webPreferences, 'capture-picker');

  pickerWin = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 420,
    minHeight: 320,
    title: labels.title,
    parent: parent ?? undefined,
    modal: !!parent,
    show: false,
    autoHideMenuBar: true,
    webPreferences,
  });
  pickerWin.loadFile(join(__dirname, 'capture-picker.html'));
  pickerWin.webContents.on('did-finish-load', () => void sendToPicker());
  pickerWin.once('ready-to-show', () => pickerWin?.show());
  pickerWin.on('closed', () => {
    pickerWin = null;
    finishPicker(null);
  });

  return new Promise((resolve) => {
    pickerResolve = resolve;
  });
};

/** Captures a window the user picked; re-finds it by id or title. */
export const captureWindow = async (target: unknown): Promise<CaptureResult> => {
  await loadGrants();
  if (!isGrantedCaptureTarget(grants, target)) {
    return { ok: false, reason: 'not-granted' };
  }
  if (getCapturePermission() !== 'granted') {
    return { ok: false, reason: 'permission' };
  }
  try {
    const own = ownSourceIds();
    const sources = (
      await desktopCapturer.getSources({ types: ['window'], thumbnailSize: CAPTURE_SIZE })
    ).filter((s) => !own.has(s.id));
    const source = findCaptureSource(sources, target);
    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, reason: 'not-found' };
    }
    const found: CaptureTarget = { id: source.id, title: source.name };
    if (found.id !== target.id || found.title !== target.title) addGrant(found);
    return { ok: true, png: new Uint8Array(source.thumbnail.toPNG()), target: found };
  } catch (e) {
    error('window-capture: capture failed', e);
    return { ok: false, reason: 'error' };
  }
};

let isInitialized = false;
export const initWindowCaptureIpc = (): void => {
  if (isInitialized) return;
  isInitialized = true;
  void loadGrants();

  ipcMain.handle(IPC.CAPTURE_PICK_WINDOW, async (ev, labels: CapturePickerLabels) => {
    await loadGrants();
    const target = await openCapturePicker(
      BrowserWindow.fromWebContents(ev.sender),
      sanitizeLabels(labels),
    );
    if (target) {
      addGrant(target);
      info('window-capture: window picked');
    }
    return target;
  });
  ipcMain.handle(IPC.CAPTURE_WINDOW, (_ev, target: unknown) => captureWindow(target));
  ipcMain.handle(IPC.CAPTURE_PERMISSION, () => getCapturePermission());
  ipcMain.on(IPC.CAPTURE_OPEN_SETTINGS, () => {
    if (IS_MAC) void shell.openExternal(MAC_SCREEN_RECORDING_SETTINGS);
  });

  // From the picker window only.
  ipcMain.on('capture-picker-choose', (ev, id: unknown) => {
    if (!pickerWin || ev.sender !== pickerWin.webContents) return;
    const chosen = pickerSources.find((s) => s.id === id);
    finishPicker(chosen ? { id: chosen.id, title: chosen.title } : null);
  });
  ipcMain.on('capture-picker-cancel', (ev) => {
    if (!pickerWin || ev.sender !== pickerWin.webContents) return;
    finishPicker(null);
  });
  ipcMain.on('capture-picker-refresh', (ev) => {
    if (!pickerWin || ev.sender !== pickerWin.webContents) return;
    void sendToPicker();
  });
  ipcMain.on('capture-picker-open-settings', (ev) => {
    if (!pickerWin || ev.sender !== pickerWin.webContents) return;
    if (IS_MAC) void shell.openExternal(MAC_SCREEN_RECORDING_SETTINGS);
  });
};

const LABEL_KEYS: (keyof CapturePickerLabels)[] = [
  'title',
  'hint',
  'refresh',
  'cancel',
  'use',
  'empty',
  'permission',
  'openSettings',
];

const sanitizeLabels = (raw: unknown): CapturePickerLabels => {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as CapturePickerLabels;
  for (const key of LABEL_KEYS) {
    const v = src[key];
    out[key] = typeof v === 'string' ? v.slice(0, 300) : '';
  }
  return out;
};
