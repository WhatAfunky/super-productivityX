import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LayerLabel } from '../layer-label.model';
import { LayerLabelService } from '../layer-label.service';
import { LayerService } from '../layer.service';
import { selectLayerLabelEntities } from '../store/layer-label.selectors';
import {
  getLayerLabelColor,
  LAYER_LABEL_COLOR_KEYS,
  LayerLabelColorKey,
  MAX_LAYER_LABEL_NAME_LENGTH,
  pickNextLayerLabelColor,
  resolveLayerLabel,
} from '../layer-label.util';
import { LayerLabelPillComponent } from '../layer-label-pill/layer-label-pill.component';
import { DialogConfirmComponent } from '../../../ui/dialog-confirm/dialog-confirm.component';
import { T } from '../../../t.const';

export interface DialogLayerLabelsData {
  projectId: string;
}

interface LabelRow {
  label: LayerLabel;
  usedBy: number;
  mergeTargets: readonly LayerLabel[];
}

/**
 * Per-project label manager: the "heavy" tools (rename, recolour, merge,
 * delete) live here so the Layers view itself stays light.
 */
@Component({
  selector: 'dialog-layer-labels',
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatIconButton,
    MatIcon,
    MatTooltip,
    TranslatePipe,
    LayerLabelPillComponent,
  ],
  templateUrl: './dialog-layer-labels.component.html',
  styleUrls: ['./dialog-layer-labels.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogLayerLabelsComponent {
  private _matDialogRef = inject<MatDialogRef<DialogLayerLabelsComponent>>(MatDialogRef);
  private _matDialog = inject(MatDialog);
  private _store = inject(Store);
  private _layerLabelService = inject(LayerLabelService);
  private _layerService = inject(LayerService);
  readonly data = inject<DialogLayerLabelsData>(MAT_DIALOG_DATA);

  readonly T = T;
  readonly MAX_NAME_LENGTH = MAX_LAYER_LABEL_NAME_LENGTH;
  readonly swatches = LAYER_LABEL_COLOR_KEYS.map((key) => ({
    key,
    hex: getLayerLabelColor(key),
  }));

  private readonly _labels = toSignal(
    this._layerLabelService.getVisibleLabelsByProjectId$(this.data.projectId),
    { initialValue: [] as readonly LayerLabel[] },
  );
  private readonly _layers = toSignal(
    this._layerService.getLayersByProjectId$(this.data.projectId),
    { initialValue: [] },
  );
  private readonly _labelEntities = this._store.selectSignal(selectLayerLabelEntities);

  readonly rows = computed<LabelRow[]>(() => {
    const labels = this._labels();
    const entities = this._labelEntities();
    const counts = new Map<string, number>();
    for (const layer of this._layers()) {
      const resolved = resolveLayerLabel(layer.labelId, entities);
      if (resolved) counts.set(resolved.id, (counts.get(resolved.id) ?? 0) + 1);
    }
    return labels.map((label) => ({
      label,
      usedBy: counts.get(label.id) ?? 0,
      mergeTargets: labels.filter((l) => l.id !== label.id),
    }));
  });

  addLabel(input: HTMLInputElement): void {
    const used = this._labels().map((l) => l.color);
    const id = this._layerLabelService.addLabel(
      this.data.projectId,
      input.value,
      pickNextLayerLabelColor(used),
    );
    if (id) {
      input.value = '';
    }
  }

  rename(label: LayerLabel, ev: Event): void {
    const inputEl = ev.target as HTMLInputElement;
    const name = inputEl.value.trim();
    if (!name) {
      // A label always has a name: an emptied field snaps back.
      inputEl.value = label.name;
      return;
    }
    if (name !== label.name) {
      this._layerLabelService.rename(label.id, name);
    }
  }

  recolor(label: LayerLabel, color: LayerLabelColorKey): void {
    if (color !== label.color) {
      this._layerLabelService.recolor(label.id, color);
    }
  }

  async merge(row: LabelRow, ev: Event): Promise<void> {
    const select = ev.target as HTMLSelectElement;
    const target = row.mergeTargets.find((l) => l.id === select.value);
    select.value = '';
    if (!target) return;
    const isConfirmed = await this._confirm(T.F.LAYER.LABELS.MERGE_CONFIRM, {
      source: row.label.name,
      target: target.name,
    });
    if (isConfirmed) {
      this._layerLabelService.merge(row.label.id, target.id);
    }
  }

  async delete(row: LabelRow): Promise<void> {
    const isConfirmed = await this._confirm(T.F.LAYER.LABELS.DELETE_CONFIRM, {
      name: row.label.name,
      nr: row.usedBy,
    });
    if (isConfirmed) {
      this._layerLabelService.delete(row.label.id);
    }
  }

  close(): void {
    this._matDialogRef.close();
  }

  private async _confirm(
    message: string,
    translateParams: Record<string, string | number>,
  ): Promise<boolean> {
    return !!(await firstValueFrom(
      this._matDialog
        .open(DialogConfirmComponent, {
          restoreFocus: true,
          data: { message, translateParams },
        })
        .afterClosed(),
    ));
  }
}
