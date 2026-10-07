import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { LayerLabel } from './layer-label.model';
import {
  addLayerLabel,
  deleteLayerLabel,
  updateLayerLabel,
} from './store/layer-label.actions';
import { selectVisibleLayerLabelsByProjectIdMap } from './store/layer-label.selectors';
import { LayerLabelColorKey, sanitizeLayerLabelName } from './layer-label.util';

const EMPTY_LABELS: readonly LayerLabel[] = Object.freeze([]);

@Injectable({
  providedIn: 'root',
})
export class LayerLabelService {
  private _store = inject(Store);

  /** The project's labels a user can pick (merged-away ones excluded). */
  getVisibleLabelsByProjectId$(projectId: string): Observable<readonly LayerLabel[]> {
    return this._store
      .select(selectVisibleLayerLabelsByProjectIdMap)
      .pipe(map((m) => m.get(projectId) ?? EMPTY_LABELS));
  }

  /** Returns the new label's id, or null for an empty name. */
  addLabel(projectId: string, name: string, color: LayerLabelColorKey): string | null {
    const cleanName = sanitizeLayerLabelName(name);
    if (!cleanName) return null;
    const id = nanoid();
    this._store.dispatch(
      addLayerLabel({ layerLabel: { id, projectId, name: cleanName, color } }),
    );
    return id;
  }

  rename(id: string, name: string): void {
    if (!sanitizeLayerLabelName(name)) return;
    this._store.dispatch(updateLayerLabel({ layerLabel: { id, changes: { name } } }));
  }

  recolor(id: string, color: LayerLabelColorKey): void {
    this._store.dispatch(updateLayerLabel({ layerLabel: { id, changes: { color } } }));
  }

  /**
   * Fold `sourceId` into `targetId`: one update on the source label. Its layers
   * show the target from now on; no layer is rewritten.
   */
  merge(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this._store.dispatch(
      updateLayerLabel({
        layerLabel: { id: sourceId, changes: { mergedIntoId: targetId } },
      }),
    );
  }

  /** Its layers (and those of labels merged into it) become unlabelled. */
  delete(id: string): void {
    this._store.dispatch(deleteLayerLabel({ id }));
  }
}
