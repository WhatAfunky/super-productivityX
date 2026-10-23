import { computed, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { IS_ELECTRON } from '../../app.constants';
import { LS } from '../../core/persistence/storage-keys.const';
import { Log } from '../../core/log';
import { T } from '../../t.const';
import {
  CapturePermission,
  CapturePickerLabels,
  CaptureTarget,
} from '../../../../electron/shared-with-frontend/window-capture.model';
import { Layer } from './layer.model';
import { LayerImageService } from './layer-image.service';
import { LayerService } from './layer.service';
import { LayerExportService } from './layer-export.service';
import { selectAllLayers, selectLayerById } from './store/layer.selectors';
import { selectCurrentTaskId } from '../tasks/store/task.selectors';
import { selectTimer } from '../focus-mode/store/focus-mode.selectors';
import {
  CAPTURE_INTERVAL_MS,
  captureWarnLevel,
  capturesToThinOut,
  createCaptureId,
  isCaptureId,
  LayerCapture,
} from './layer-capture.util';

/** Per layer, on this device only: the window to capture and whether it's on. */
export interface LayerCaptureSetting {
  target: CaptureTarget;
  isEnabled: boolean;
}

interface CaptureStats {
  count: number;
  bytes: number;
}

const readJson = <V>(key: string): Record<string, V> => {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, V>) : {};
  } catch {
    return {};
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the choice just isn't remembered.
  }
};

/**
 * Auto screenshots (v3.3, desktop only): while a focus session runs on a layer
 * (▶), the window picked for it is captured every 5 minutes into the layer's
 * history, and each capture becomes the layer's screenshot. Everything here is
 * device-local; nothing is synced except the layer's `imageId` pointer.
 */
@Injectable({
  providedIn: 'root',
})
export class LayerCaptureService {
  private _store = inject(Store);
  private _injector = inject(Injector);
  private _translateService = inject(TranslateService);
  private _layerImageService = inject(LayerImageService);
  private _layerService = inject(LayerService);
  private _layerExportService = inject(LayerExportService);

  readonly isAvailable = IS_ELECTRON;

  private readonly _settings = signal<Record<string, LayerCaptureSetting>>(
    readJson<LayerCaptureSetting>(LS.LAYER_CAPTURE_TARGETS),
  );
  private readonly _warnAck = signal<Record<string, number>>(
    readJson<number>(LS.LAYER_CAPTURE_WARN_ACK),
  );
  private readonly _stats = signal<ReadonlyMap<string, CaptureStats>>(new Map());
  private readonly _skipped = signal<Record<string, number>>({});
  private _inFlight = new Set<string>();
  private _isInitialized = false;

  readonly permission = signal<CapturePermission>('granted');
  /** Bumped whenever a history changes, so open views reload it. */
  readonly historyVersion = signal(0);
  readonly nextCaptureAt = signal<number | null>(null);

  private readonly _layers = this._store.selectSignal(selectAllLayers);
  private readonly _currentTaskId = this._store.selectSignal(selectCurrentTaskId);
  private readonly _timer = this._store.selectSignal(selectTimer);

  /** The layer being captured right now (focused with ▶, session running). */
  readonly activeLayerId = computed((): string | null => {
    const timer = this._timer();
    if (!timer || timer.purpose !== 'work' || !timer.isRunning) return null;
    const taskId = this._currentTaskId();
    if (!taskId) return null;
    const layer = this._layers().find((l) => l.focusTaskId === taskId);
    return layer && this._settings()[layer.id]?.isEnabled ? layer.id : null;
  });

  /** Layers whose history passed a 100 MB step the user hasn't acknowledged. */
  readonly warnedLayerIds = computed((): ReadonlySet<string> => {
    const ack = this._warnAck();
    const ids = new Set<string>();
    for (const [id, s] of this._stats()) {
      if (captureWarnLevel(s.bytes) > (ack[id] ?? 0)) ids.add(id);
    }
    return ids;
  });

  setting(layerId: string): LayerCaptureSetting | null {
    return this._settings()[layerId] ?? null;
  }

  stats(layerId: string): CaptureStats {
    return this._stats().get(layerId) ?? { count: 0, bytes: 0 };
  }

  skippedCount(layerId: string): number {
    return this._skipped()[layerId] ?? 0;
  }

  /** The warning level (bytes) to show, or 0 when there's nothing to warn about. */
  warnLevel(layerId: string): number {
    const level = captureWarnLevel(this.stats(layerId).bytes);
    return level > (this._warnAck()[layerId] ?? 0) ? level : 0;
  }

  /** Starts the 5-minute schedule. Desktop app only; safe to call twice. */
  init(): void {
    if (!IS_ELECTRON || this._isInitialized || !window.ea?.captureWindow) return;
    this._isInitialized = true;
    void this.refreshStats();
    void window.ea.getCapturePermission().then((p) => this.permission.set(p));

    effect(
      (onCleanup) => {
        const layerId = this.activeLayerId();
        if (!layerId) {
          this.nextCaptureAt.set(null);
          return;
        }
        this.nextCaptureAt.set(Date.now() + CAPTURE_INTERVAL_MS);
        const handle = setInterval(() => {
          this.nextCaptureAt.set(Date.now() + CAPTURE_INTERVAL_MS);
          void this.captureNow(layerId);
        }, CAPTURE_INTERVAL_MS);
        onCleanup(() => clearInterval(handle));
      },
      { injector: this._injector },
    );
  }

  /** Opens the window picker; turns auto capture on for the chosen window. */
  async pickWindow(layerId: string): Promise<boolean> {
    if (!window.ea?.pickCaptureWindow) return false;
    const target = await window.ea.pickCaptureWindow(this._pickerLabels());
    if (!target) return false;
    this._updateSettings(layerId, { target, isEnabled: true });
    this._clearSkipped(layerId);
    void window.ea.getCapturePermission().then((p) => this.permission.set(p));
    return true;
  }

  setEnabled(layerId: string, isEnabled: boolean): void {
    const current = this._settings()[layerId];
    if (current) this._updateSettings(layerId, { ...current, isEnabled });
  }

  /**
   * Captures the layer's window into its history and makes it the layer's
   * screenshot. Returns false when nothing was captured (skipped).
   */
  async captureNow(layerId: string): Promise<boolean> {
    const setting = this._settings()[layerId];
    if (!window.ea?.captureWindow || !setting || this._inFlight.has(layerId)) {
      return false;
    }
    this._inFlight.add(layerId);
    try {
      const result = await window.ea.captureWindow(setting.target);
      if (!result.ok) {
        if (result.reason === 'permission') {
          this.permission.set('denied');
        } else {
          this._skipped.update((s) => ({ ...s, [layerId]: (s[layerId] ?? 0) + 1 }));
        }
        return false;
      }
      this.permission.set('granted');
      this._clearSkipped(layerId);
      if (
        result.target.id !== setting.target.id ||
        result.target.title !== setting.target.title
      ) {
        this._updateSettings(layerId, { ...setting, target: result.target });
      }

      await this._adoptManualScreenshot(layerId);
      const captureId = createCaptureId(layerId, Date.now());
      const saved = await this._layerImageService.saveAs(
        captureId,
        new Blob([result.png as BlobPart], { type: 'image/png' }),
      );
      const layer = await this._layer(layerId);
      if (saved && layer) this._layerService.setImageId(layer, captureId);
      await this._changed();
      return !!saved;
    } catch (e) {
      Log.err('LayerCaptureService: capture failed', e);
      return false;
    } finally {
      this._inFlight.delete(layerId);
    }
  }

  listCaptures(layerId: string): Promise<LayerCapture[]> {
    return this._layerImageService.listCaptures(layerId);
  }

  async useAsScreenshot(layerId: string, captureId: string): Promise<void> {
    const layer = await this._layer(layerId);
    if (layer && isCaptureId(captureId)) this._layerService.setImageId(layer, captureId);
  }

  /** Deletes one capture; if it was the screenshot, the newest other one takes over. */
  async deleteCapture(layerId: string, captureId: string): Promise<void> {
    const layer = await this._layer(layerId);
    if (layer?.imageId === captureId) {
      const rest = (await this.listCaptures(layerId)).filter((c) => c.id !== captureId);
      const newest = rest.at(-1);
      if (newest) {
        this._layerService.setImageId(layer, newest.id);
      } else {
        this._layerService.removeImage(layer);
      }
    }
    await this._layerImageService.delete(captureId);
    await this._changed();
  }

  /** 7 days in full, then one per hour, then one per day after 30 days. */
  async thinOut(layerId: string): Promise<number> {
    const layer = await this._layer(layerId);
    const keep = new Set(layer?.imageId ? [layer.imageId] : []);
    const drop = capturesToThinOut(await this.listCaptures(layerId), Date.now(), keep);
    await this._layerImageService.deleteMany(drop);
    await this._changed();
    return drop.length;
  }

  /** Saves the history as a ZIP, then deletes it (the current screenshot stays). */
  async exportAndClear(layerId: string): Promise<number> {
    const layer = await this._layer(layerId);
    if (!layer) return 0;
    const exported = await this._layerExportService.exportCaptures(layer);
    if (!exported) return 0;
    const drop = (await this.listCaptures(layerId))
      .map((c) => c.id)
      .filter((id) => id !== layer.imageId);
    await this._layerImageService.deleteMany(drop);
    await this._changed();
    return exported;
  }

  exportCaptures(layer: Layer): Promise<number> {
    return this._layerExportService.exportCaptures(layer);
  }

  /** "Keep everything": no warning until the next 100 MB. */
  keepEverything(layerId: string): void {
    const level = captureWarnLevel(this.stats(layerId).bytes);
    this._warnAck.update((a) => ({ ...a, [layerId]: level }));
    writeJson(LS.LAYER_CAPTURE_WARN_ACK, this._warnAck());
  }

  dismissSkipped(layerId: string): void {
    this._clearSkipped(layerId);
  }

  openPermissionSettings(): void {
    window.ea?.openCaptureSettings?.();
  }

  async refreshStats(): Promise<void> {
    const stats = new Map<string, CaptureStats>();
    for (const c of await this._layerImageService.listCaptures()) {
      const s = stats.get(c.layerId) ?? { count: 0, bytes: 0 };
      s.count += 1;
      s.bytes += c.size;
      stats.set(c.layerId, s);
    }
    this._stats.set(stats);
  }

  /**
   * The first capture replaces a screenshot added by hand: keep that one in
   * the history instead of losing it.
   */
  private async _adoptManualScreenshot(layerId: string): Promise<void> {
    const layer = await this._layer(layerId);
    if (!layer?.imageId || isCaptureId(layer.imageId)) return;
    const blob = await this._layerImageService.getFull(layer.imageId);
    if (!blob) return;
    const adoptedId = createCaptureId(layerId, Date.now() - 1000);
    if (await this._layerImageService.saveAs(adoptedId, blob)) {
      this._layerService.setImageId(layer, adoptedId);
    }
  }

  private async _layer(layerId: string): Promise<Layer | undefined> {
    return firstValueFrom(this._store.select(selectLayerById, { id: layerId }));
  }

  private async _changed(): Promise<void> {
    await this.refreshStats();
    this.historyVersion.update((v) => v + 1);
  }

  private _updateSettings(layerId: string, setting: LayerCaptureSetting): void {
    this._settings.update((s) => ({ ...s, [layerId]: setting }));
    writeJson(LS.LAYER_CAPTURE_TARGETS, this._settings());
  }

  private _clearSkipped(layerId: string): void {
    if (!this._skipped()[layerId]) return;
    this._skipped.update((s) => {
      const next = { ...s };
      delete next[layerId];
      return next;
    });
  }

  private _pickerLabels(): CapturePickerLabels {
    const L = T.F.LAYER;
    const t = (k: string): string => this._translateService.instant(k);
    return {
      title: t(L.CAPTURE_PICK_TITLE),
      hint: t(L.CAPTURE_PICK_HINT),
      refresh: t(L.CAPTURE_PICK_REFRESH),
      cancel: t(T.G.CANCEL),
      use: t(L.CAPTURE_PICK_USE),
      empty: t(L.CAPTURE_PICK_EMPTY),
      permission: t(L.CAPTURE_PERMISSION_MSG),
      openSettings: t(L.CAPTURE_OPEN_SETTINGS),
    };
  }
}
