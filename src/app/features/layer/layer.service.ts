import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { nanoid } from 'nanoid';
import { firstValueFrom, Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { map } from 'rxjs/operators';
import { Layer } from './layer.model';
import { addLayer, deleteLayer, updateLayer } from './store/layer.actions';
import { selectAllLayers, selectLayersByProjectIdMap } from './store/layer.selectors';
import { sanitizeLayerTitle } from './layer.util';
import { SnackService } from '../../core/snack/snack.service';
import { TranslateService } from '@ngx-translate/core';
import { LayerImageService } from './layer-image.service';
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
  private _snackService = inject(SnackService);
  private _matDialog = inject(MatDialog);
  private _sectionService = inject(SectionService);
  private _layerLabelService = inject(LayerLabelService);
  private _layerImageService = inject(LayerImageService);
  private _translateService = inject(TranslateService);

  /**
   * While the Layers view is open it registers its selection here, so Add
   * layer from anywhere (e.g. the keyboard shortcut) defaults to the selected
   * layer's folder and label for that project.
   */
  private _selectionDefaults: {
    projectId: string;
    get: () => AddLayerDefaults;
  } | null = null;

  registerSelectionDefaults(projectId: string, get: () => AddLayerDefaults): () => void {
    const entry = { projectId, get };
    this._selectionDefaults = entry;
    return () => {
      if (this._selectionDefaults === entry) this._selectionDefaults = null;
    };
  }

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
   * goal-done snack, the shortcut, paste-to-create). Without explicit
   * defaults, folder and label follow the Layers view's selection when it is
   * open on this project, else the project's newest layer — "keep adding to
   * what I was just doing". An `image` (paste-to-create) is previewed in the
   * dialog and attached to the new layer.
   * Resolves to the new layer's id, or null when cancelled.
   */
  async openAddLayerDialog(
    projectId: string,
    defaults?: AddLayerDefaults,
    image?: Blob,
  ): Promise<string | null> {
    if (!defaults && this._selectionDefaults?.projectId === projectId) {
      defaults = this._selectionDefaults.get();
    }
    const [sections, labels, layers, labelEntities] = await Promise.all([
      firstValueFrom(this._sectionService.getSectionsByContextId$(projectId)),
      firstValueFrom(this._layerLabelService.getVisibleLabelsByProjectId$(projectId)),
      firstValueFrom(this.getLayersByProjectId$(projectId)),
      firstValueFrom(this._store.select(selectLayerLabelEntities)),
    ]);
    const newest = layers[0];
    const imagePreviewUrl = image ? URL.createObjectURL(image) : null;
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
              imagePreviewUrl,
            },
          },
        )
        .afterClosed(),
    );
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    if (!result) return null;
    const id = this.addLayer(projectId, result.title, result.sectionId, result.labelId);
    if (id && image) {
      await this.setImage({ id, imageId: null }, image);
    }
    return id;
  }

  /**
   * A copy of the layer on top of the list: same folder, label and screenshot.
   * The screenshot is copied to its own file first, so deleting either layer
   * never strips the other; the copy is then one addLayer op.
   */
  async duplicateLayer(layer: Layer): Promise<string | null> {
    const imageId = layer.imageId
      ? await this._layerImageService.copy(layer.imageId)
      : null;
    const suffix = this._translateService.instant(T.F.LAYER.COPY_SUFFIX);
    const id = nanoid();
    this._store.dispatch(
      addLayer({
        layer: {
          id,
          projectId: layer.projectId,
          title: sanitizeLayerTitle(`${layer.title} ${suffix}`),
          createdAt: Date.now(),
          sectionId: layer.sectionId ?? null,
          labelId: layer.labelId ?? null,
          imageId,
        },
      }),
    );
    return id;
  }

  updateLayer(id: string, changes: LayerEditableFields): void {
    this._store.dispatch(updateLayer({ layer: { id, changes } }));
  }

  deleteLayer(layer: Layer): void {
    this._store.dispatch(deleteLayer({ id: layer.id }));
    // Local side effect of a local user intent: not an effect, so a replayed
    // or remote delete never touches files.
    void this._layerImageService.delete(layer.imageId);
  }

  /** Stores `image` on this device and points the layer at it. */
  async setImage(layer: Pick<Layer, 'id' | 'imageId'>, image: Blob): Promise<boolean> {
    const imageId = await this._layerImageService.save(image);
    if (!imageId) {
      // saveImage already shows a snack for size/quota problems; this covers
      // the remaining failures.
      this._snackService.open({ type: 'ERROR', msg: T.F.LAYER.IMAGE_SAVE_FAILED });
      return false;
    }
    this._store.dispatch(updateLayer({ layer: { id: layer.id, changes: { imageId } } }));
    void this._layerImageService.delete(layer.imageId);
    return true;
  }

  removeImage(layer: Layer): void {
    if (!layer.imageId) return;
    this._store.dispatch(
      updateLayer({ layer: { id: layer.id, changes: { imageId: null } } }),
    );
    void this._layerImageService.delete(layer.imageId);
  }

  /** Deletes this device's screenshot files that no layer points at any more. */
  async deleteOrphanedImages(): Promise<number> {
    const layers = await firstValueFrom(this._store.select(selectAllLayers));
    const referenced = new Set<string>();
    for (const l of layers) {
      if (l.imageId) referenced.add(l.imageId);
    }
    return this._layerImageService.deleteOrphans(referenced);
  }
}
