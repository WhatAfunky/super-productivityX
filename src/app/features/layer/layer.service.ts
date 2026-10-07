import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { nanoid } from 'nanoid';
import { firstValueFrom, Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { map } from 'rxjs/operators';
import { Layer } from './layer.model';
import { addLayer, deleteLayer, updateLayer } from './store/layer.actions';
import { selectLayersByProjectIdMap } from './store/layer.selectors';
import {
  createLayerImageId,
  isValidLayerImageId,
  sanitizeLayerTitle,
} from './layer.util';
import { ClipboardImageService } from '../../core/clipboard-image/clipboard-image.service';
import { SnackService } from '../../core/snack/snack.service';
import { Log } from '../../core/log';
import { T } from '../../t.const';
import { SectionService } from '../section/section.service';
import { LayerLabelService } from './layer-label.service';
import { selectLayerLabelEntities } from './store/layer-label.selectors';
import { resolveLayerLabel } from './layer-label.util';
import {
  DialogAddLayerComponent,
  DialogAddLayerData,
  DialogAddLayerResult,
} from './dialog-add-layer/dialog-add-layer.component';

const EMPTY_LAYERS: readonly Layer[] = Object.freeze([]);

export type LayerEditableFields = Partial<Pick<Layer, 'title' | 'sectionId' | 'labelId'>>;

/** Pre-selected folder and label for the Add layer dialog. */
export interface AddLayerDefaults {
  sectionId: string | null;
  labelId: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class LayerService {
  private _store = inject(Store);
  private _clipboardImageService = inject(ClipboardImageService);
  private _snackService = inject(SnackService);
  private _matDialog = inject(MatDialog);
  private _sectionService = inject(SectionService);
  private _layerLabelService = inject(LayerLabelService);
  // imageId → blob: URL. Images are immutable per id (a replaced screenshot
  // gets a new id), so a cached URL never goes stale.
  private _imageUrlCache = new Map<string, string>();

  getLayersByProjectId$(projectId: string): Observable<readonly Layer[]> {
    return this._store
      .select(selectLayersByProjectIdMap)
      .pipe(map((m) => m.get(projectId) ?? EMPTY_LAYERS));
  }

  /** Returns the new layer's id, or null when the title is empty. */
  addLayer(
    projectId: string,
    title: string,
    sectionId: string | null,
    labelId: string | null = null,
  ): string | null {
    const cleanTitle = sanitizeLayerTitle(title);
    if (!cleanTitle) return null;
    const id = nanoid();
    this._store.dispatch(
      addLayer({
        layer: {
          id,
          projectId,
          title: cleanTitle,
          createdAt: Date.now(),
          sectionId,
          labelId,
          imageId: null,
        },
      }),
    );
    return id;
  }

  /**
   * The one way layers get added from the UI (Layers view, focus mode, the
   * goal-done snack). Without explicit defaults, folder and label follow the
   * project's newest layer — "keep adding to what I was just doing".
   * Resolves to the new layer's id, or null when cancelled.
   */
  async openAddLayerDialog(
    projectId: string,
    defaults?: AddLayerDefaults,
  ): Promise<string | null> {
    const [sections, labels, layers, labelEntities] = await Promise.all([
      firstValueFrom(this._sectionService.getSectionsByContextId$(projectId)),
      firstValueFrom(this._layerLabelService.getVisibleLabelsByProjectId$(projectId)),
      firstValueFrom(this.getLayersByProjectId$(projectId)),
      firstValueFrom(this._store.select(selectLayerLabelEntities)),
    ]);
    const newest = layers[0];
    const result = await firstValueFrom(
      this._matDialog
        .open<DialogAddLayerComponent, DialogAddLayerData, DialogAddLayerResult>(
          DialogAddLayerComponent,
          {
            restoreFocus: true,
            data: {
              sections,
              labels,
              defaultSectionId: defaults
                ? defaults.sectionId
                : (newest?.sectionId ?? null),
              defaultLabelId: defaults
                ? defaults.labelId
                : (resolveLayerLabel(newest?.labelId, labelEntities)?.id ?? null),
            },
          },
        )
        .afterClosed(),
    );
    if (!result) return null;
    return this.addLayer(projectId, result.title, result.sectionId, result.labelId);
  }

  updateLayer(id: string, changes: LayerEditableFields): void {
    this._store.dispatch(updateLayer({ layer: { id, changes } }));
  }

  deleteLayer(layer: Layer): void {
    this._store.dispatch(deleteLayer({ id: layer.id }));
    // Local side effect of a local user intent: not an effect, so a replayed
    // or remote delete never touches files.
    void this._deleteImageFile(layer.imageId);
  }

  /** Stores `image` on this device and points the layer at it. */
  async setImage(layer: Layer, image: Blob): Promise<boolean> {
    const imageId = createLayerImageId(nanoid());
    let savedUrl: string | null = null;
    try {
      savedUrl = await this._clipboardImageService.saveImage(image, imageId);
    } catch (e) {
      Log.err('[Layer] saving image failed', { layerId: layer.id });
    }
    if (!savedUrl) {
      // saveImage already shows a snack for size/quota problems; this covers
      // the remaining failures.
      this._snackService.open({ type: 'ERROR', msg: T.F.LAYER.IMAGE_SAVE_FAILED });
      return false;
    }
    this._store.dispatch(updateLayer({ layer: { id: layer.id, changes: { imageId } } }));
    void this._deleteImageFile(layer.imageId);
    return true;
  }

  removeImage(layer: Layer): void {
    if (!layer.imageId) return;
    this._store.dispatch(
      updateLayer({ layer: { id: layer.id, changes: { imageId: null } } }),
    );
    void this._deleteImageFile(layer.imageId);
  }

  /** A blob: URL for the image, or null if it is not on this device. */
  async resolveImageUrl(imageId: string | null | undefined): Promise<string | null> {
    if (!isValidLayerImageId(imageId)) return null;
    const cached = this._imageUrlCache.get(imageId);
    if (cached) return cached;
    try {
      const blob = await this._clipboardImageService.getImage(imageId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      this._imageUrlCache.set(imageId, url);
      return url;
    } catch (e) {
      return null;
    }
  }

  private async _deleteImageFile(imageId: string | null | undefined): Promise<void> {
    if (!isValidLayerImageId(imageId)) return;
    const url = this._imageUrlCache.get(imageId);
    if (url) {
      URL.revokeObjectURL(url);
      this._imageUrlCache.delete(imageId);
    }
    try {
      await this._clipboardImageService.deleteImage(imageId);
    } catch (e) {
      // Already gone (or never on this device): nothing to clean up.
    }
  }
}
