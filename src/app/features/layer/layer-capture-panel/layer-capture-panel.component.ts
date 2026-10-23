import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { Layer } from '../layer.model';
import { LayerCaptureService } from '../layer-capture.service';
import { LayerImageComponent } from '../layer-image/layer-image.component';
import { formatBytes, LayerCapture } from '../layer-capture.util';
import { SnackService } from '../../../core/snack/snack.service';
import { LocaleDatePipe } from '../../../ui/pipes/locale-date.pipe';
import { T } from '../../../t.const';

/** Captures shown as thumbnails; the slider reaches all of them. */
const STRIP_SIZE = 48;
const PLAY_FRAME_MS = 250;

/**
 * Auto screenshots (v3.3) in the layer preview: the window to capture, the
 * history (viewer, slider, strip) and its actions. Desktop app only.
 */
@Component({
  selector: 'layer-capture-panel',
  templateUrl: './layer-capture-panel.component.html',
  styleUrls: ['./layer-capture-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MatButton,
    MatIconButton,
    MatIcon,
    MatTooltip,
    MatSlideToggle,
    LayerImageComponent,
    LocaleDatePipe,
  ],
})
export class LayerCapturePanelComponent {
  readonly captureService = inject(LayerCaptureService);
  private _snackService = inject(SnackService);

  readonly layer = input.required<Layer>();
  readonly T = T;

  readonly captures = signal<LayerCapture[]>([]);
  readonly selectedIndex = signal(0);
  readonly isBusy = signal(false);
  readonly isPlaying = signal(false);
  private _playHandle: ReturnType<typeof setInterval> | null = null;

  readonly setting = computed(() => {
    // Re-read when the history changes (setting updates go through it too).
    this.captureService.historyVersion();
    return this.captureService.setting(this.layer().id);
  });
  readonly isActive = computed(
    () => this.captureService.activeLayerId() === this.layer().id,
  );
  readonly stats = computed(() => {
    this.captureService.historyVersion();
    return this.captureService.stats(this.layer().id);
  });
  readonly sizeText = computed(() => formatBytes(this.stats().bytes));
  readonly warnLevel = computed(() => {
    this.captureService.historyVersion();
    return this.captureService.warnLevel(this.layer().id);
  });
  readonly skipped = computed(() => {
    this.captureService.historyVersion();
    return this.captureService.skippedCount(this.layer().id);
  });
  readonly isPermissionMissing = computed(
    () => !!this.setting() && this.captureService.permission() !== 'granted',
  );
  readonly selected = computed(() => this.captures()[this.selectedIndex()] ?? null);
  readonly strip = computed(() => {
    const all = this.captures();
    const start = Math.max(0, all.length - STRIP_SIZE);
    return all.slice(start).map((capture, i) => ({ capture, index: start + i }));
  });

  constructor() {
    // Reload the history for this layer, and after every change to it.
    effect(() => {
      const layerId = this.layer().id;
      this.captureService.historyVersion();
      void this._load(layerId);
    });
    inject(DestroyRef).onDestroy(() => this._stopPlaying());
  }

  async pickWindow(): Promise<void> {
    await this.captureService.pickWindow(this.layer().id);
    this.captureService.historyVersion.update((v) => v + 1);
  }

  setEnabled(isEnabled: boolean): void {
    this.captureService.setEnabled(this.layer().id, isEnabled);
    this.captureService.historyVersion.update((v) => v + 1);
  }

  async captureNow(): Promise<void> {
    this.isBusy.set(true);
    try {
      const ok = await this.captureService.captureNow(this.layer().id);
      if (!ok && this.captureService.permission() === 'granted' && !this.skipped()) {
        this._snackService.open({ type: 'ERROR', msg: T.F.LAYER.CAPTURE_FAILED });
      }
    } finally {
      this.isBusy.set(false);
    }
  }

  select(index: number): void {
    this._stopPlaying();
    this.selectedIndex.set(Math.max(0, Math.min(index, this.captures().length - 1)));
  }

  onSlide(ev: Event): void {
    this.select(Number((ev.target as HTMLInputElement).value));
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this._stopPlaying();
      return;
    }
    const count = this.captures().length;
    if (count < 2) return;
    if (this.selectedIndex() >= count - 1) this.selectedIndex.set(0);
    this.isPlaying.set(true);
    this._playHandle = setInterval(() => {
      const next = this.selectedIndex() + 1;
      if (next >= this.captures().length) {
        this._stopPlaying();
      } else {
        this.selectedIndex.set(next);
      }
    }, PLAY_FRAME_MS);
  }

  async useAsScreenshot(): Promise<void> {
    const capture = this.selected();
    if (capture) await this.captureService.useAsScreenshot(this.layer().id, capture.id);
  }

  async deleteSelected(): Promise<void> {
    const capture = this.selected();
    if (capture) await this.captureService.deleteCapture(this.layer().id, capture.id);
  }

  async exportAll(): Promise<void> {
    await this.captureService.exportCaptures(this.layer());
  }

  async thinOut(): Promise<void> {
    const count = await this.captureService.thinOut(this.layer().id);
    this._snackService.open({
      msg: T.F.LAYER.CAPTURE_THINNED,
      translateParams: { count },
      ico: 'auto_delete',
    });
  }

  async exportAndClear(): Promise<void> {
    await this.captureService.exportAndClear(this.layer().id);
  }

  keepEverything(): void {
    this.captureService.keepEverything(this.layer().id);
    this.captureService.historyVersion.update((v) => v + 1);
  }

  dismissSkipped(): void {
    this.captureService.dismissSkipped(this.layer().id);
    this.captureService.historyVersion.update((v) => v + 1);
  }

  private async _load(layerId: string): Promise<void> {
    const captures = await this.captureService.listCaptures(layerId);
    if (layerId !== this.layer().id) return;
    const wasAtEnd = this.selectedIndex() >= this.captures().length - 1;
    this.captures.set(captures);
    // Follow the newest capture unless the user is looking at an older one.
    if (wasAtEnd || this.selectedIndex() >= captures.length) {
      this.selectedIndex.set(Math.max(0, captures.length - 1));
    }
  }

  private _stopPlaying(): void {
    if (this._playHandle) clearInterval(this._playHandle);
    this._playHandle = null;
    this.isPlaying.set(false);
  }
}
