import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { switchMap } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { Project } from '../../project/project.model';
import { Layer } from '../layer.model';
import { LayerLabel } from '../layer-label.model';
import { LayerService } from '../layer.service';
import { LayerLabelService } from '../layer-label.service';
import { selectLayerLabelEntities } from '../store/layer-label.selectors';
import { getLayerLabelColor, resolveLayerLabel } from '../layer-label.util';
import { SectionService } from '../../section/section.service';
import { Section } from '../../section/section.model';
import { WorkContextType } from '../../work-context/work-context.model';
import { getImageFromDataTransfer, MAX_LAYER_TITLE_LENGTH } from '../layer.util';
import { LayerImageComponent } from '../layer-image/layer-image.component';
import { LayerLabelPillComponent } from '../layer-label-pill/layer-label-pill.component';
import {
  DialogLayerLabelsComponent,
  DialogLayerLabelsData,
} from '../dialog-layer-labels/dialog-layer-labels.component';
import { CollapsibleComponent } from '../../../ui/collapsible/collapsible.component';
import {
  SegmentedButtonGroupComponent,
  SegmentedButtonOption,
} from '../../../ui/segmented-button-group/segmented-button-group.component';
import { DialogPromptComponent } from '../../../ui/dialog-prompt/dialog-prompt.component';
import { DialogConfirmComponent } from '../../../ui/dialog-confirm/dialog-confirm.component';
import { LocaleDatePipe } from '../../../ui/pipes/locale-date.pipe';
import { DoneToggleComponent } from '../../../ui/done-toggle/done-toggle.component';
import { WorkContextService } from '../../work-context/work-context.service';
import { TaskService } from '../../tasks/task.service';
import { TaskWithSubTasks } from '../../tasks/task.model';
import { LS } from '../../../core/persistence/storage-keys.const';
import { T } from '../../../t.const';

type LayerViewMode = 'folder' | 'label' | 'time';

/** A layer with its resolved label, precomputed so the template calls nothing. */
interface LayerRow {
  layer: Layer;
  label: LayerLabel | null;
  /** Hex for the row's left-edge strip, or null without a label. */
  labelColor: string | null;
}

interface LayerGroup {
  key: string;
  /** Section title; empty for unfiled / timeline (translated in the template). */
  title: string;
  /** Set when grouping by label: the group header shows the pill. */
  label: LayerLabel | null;
  isFallbackGroup: boolean;
  isExpanded: boolean;
  total: number;
  shown: readonly LayerRow[];
  hiddenCount: number;
}

interface LabelChip {
  label: LayerLabel;
  count: number;
  isActive: boolean;
}

/** Each group shows only its newest layers until "show older" is clicked. */
export const NEWEST_LAYERS_SHOWN = 8;
const FALLBACK_KEY = '__none__';
const TIMELINE_KEY = '__timeline__';
const EMPTY_SECTIONS: readonly Section[] = [];
const EMPTY_LAYERS: readonly Layer[] = [];
const EMPTY_LABELS: readonly LayerLabel[] = [];
const EMPTY_GOALS: TaskWithSubTasks[] = [];

// The goals strip's shown/hidden state is a per-device view preference, so it
// lives in localStorage and never syncs. Storage can be unavailable (private
// window, blocked site data): fall back to "shown" and don't remember.
const readIsGoalsStripHidden = (): boolean => {
  try {
    return localStorage.getItem(LS.LAYERS_GOALS_STRIP_HIDDEN) === 'true';
  } catch {
    return false;
  }
};

const writeIsGoalsStripHidden = (isHidden: boolean): void => {
  try {
    if (isHidden) {
      localStorage.setItem(LS.LAYERS_GOALS_STRIP_HIDDEN, 'true');
    } else {
      localStorage.removeItem(LS.LAYERS_GOALS_STRIP_HIDDEN);
    }
  } catch {
    // Not remembered this time; the strip still toggles.
  }
};

@Component({
  selector: 'layers-view',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    CollapsibleComponent,
    SegmentedButtonGroupComponent,
    LayerImageComponent,
    LayerLabelPillComponent,
    DoneToggleComponent,
    LocaleDatePipe,
    TranslatePipe,
    MatButton,
    MatIconButton,
    MatIcon,
    MatTooltip,
  ],
  templateUrl: './layers-view.component.html',
  styleUrls: ['./layers-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayersViewComponent {
  private _store = inject(Store);
  private _layerService = inject(LayerService);
  private _layerLabelService = inject(LayerLabelService);
  private _sectionService = inject(SectionService);
  private _matDialog = inject(MatDialog);
  private _workContextService = inject(WorkContextService);
  private _taskService = inject(TaskService);

  readonly project = input.required<Project>();

  readonly T = T;
  readonly MAX_TITLE_LENGTH = MAX_LAYER_TITLE_LENGTH;
  readonly viewModeOptions: readonly SegmentedButtonOption[] = [
    // Text only: three options with icons don't fit the list pane's width.
    { id: 'folder', labelKey: T.F.LAYER.VIEW_BY_FOLDER },
    { id: 'label', labelKey: T.F.LAYER.VIEW_BY_LABEL },
    { id: 'time', labelKey: T.F.LAYER.VIEW_TIMELINE },
  ];

  private readonly _fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  private readonly _projectId$ = toObservable(computed(() => this.project().id));

  readonly layers = toSignal(
    this._projectId$.pipe(
      switchMap((id) => this._layerService.getLayersByProjectId$(id)),
    ),
    { initialValue: EMPTY_LAYERS },
  );

  readonly sections = toSignal(
    this._projectId$.pipe(
      switchMap((id) => this._sectionService.getSectionsByContextId$(id)),
    ),
    { initialValue: EMPTY_SECTIONS },
  );

  /** Labels a user can pick (merged-away ones excluded), sorted by name. */
  readonly labels = toSignal(
    this._projectId$.pipe(
      switchMap((id) => this._layerLabelService.getVisibleLabelsByProjectId$(id)),
    ),
    { initialValue: EMPTY_LABELS },
  );

  private readonly _labelEntities = this._store.selectSignal(selectLayerLabelEntities);

  /**
   * Open goals/tasks of the project, read-only apart from completing them.
   * The Layers page is a project child route, so the active work context is
   * this project.
   */
  readonly goals = toSignal(this._workContextService.undoneTasks$, {
    initialValue: EMPTY_GOALS,
  });
  readonly isGoalsShown = signal(!readIsGoalsStripHidden());

  readonly viewMode = signal<LayerViewMode>('folder');
  readonly selectedId = signal<string | null>(null);
  readonly searchText = signal('');
  private readonly _labelFilter = signal<ReadonlySet<string>>(new Set());
  private readonly _showAllKeys = signal<ReadonlySet<string>>(new Set());
  private readonly _collapsedKeys = signal<ReadonlySet<string>>(new Set());

  /** Every layer with its resolved label (merges followed, deleted → none). */
  private readonly _rows = computed<LayerRow[]>(() => {
    const entities = this._labelEntities();
    return this.layers().map((layer) => {
      const label = resolveLayerLabel(layer.labelId, entities);
      return { layer, label, labelColor: label ? getLayerLabelColor(label.color) : null };
    });
  });

  readonly selectedRow = computed(
    () => this._rows().find((r) => r.layer.id === this.selectedId()) ?? null,
  );
  readonly selectedLayer = computed(() => this.selectedRow()?.layer ?? null);

  readonly isFiltering = computed(
    () => !!this.searchText().trim() || this._labelFilter().size > 0,
  );

  private readonly _visibleRows = computed<LayerRow[]>(() => {
    const query = this.searchText().trim().toLowerCase();
    const filter = this._labelFilter();
    return this._rows().filter(
      (r) =>
        (!query || r.layer.title.toLowerCase().includes(query)) &&
        (!filter.size || (!!r.label && filter.has(r.label.id))),
    );
  });

  readonly labelChips = computed<LabelChip[]>(() => {
    const counts = new Map<string, number>();
    for (const r of this._rows()) {
      if (r.label) counts.set(r.label.id, (counts.get(r.label.id) ?? 0) + 1);
    }
    const filter = this._labelFilter();
    return this.labels().map((label) => ({
      label,
      count: counts.get(label.id) ?? 0,
      isActive: filter.has(label.id),
    }));
  });

  readonly groups = computed<LayerGroup[]>(() => {
    const rows = this._visibleRows();
    const showAll = this._showAllKeys();
    const collapsed = this._collapsedKeys();
    // While searching or filtering, show every hit instead of the newest 8.
    const isFiltering = this.isFiltering();
    const makeGroup = (
      key: string,
      list: readonly LayerRow[],
      opts: { title?: string; label?: LayerLabel; isFallbackGroup?: boolean } = {},
    ): LayerGroup => {
      const isShowAll = isFiltering || showAll.has(key);
      return {
        key,
        title: opts.title ?? '',
        label: opts.label ?? null,
        isFallbackGroup: !!opts.isFallbackGroup,
        isExpanded: !collapsed.has(key),
        total: list.length,
        shown: isShowAll ? list : list.slice(0, NEWEST_LAYERS_SHOWN),
        hiddenCount: isShowAll ? 0 : Math.max(0, list.length - NEWEST_LAYERS_SHOWN),
      };
    };

    const mode = this.viewMode();
    if (mode === 'time') {
      return [makeGroup(TIMELINE_KEY, rows)];
    }

    // Rows arrive newest first, so each bucket stays newest first.
    const buckets = new Map<string, LayerRow[]>();
    const fallback: LayerRow[] = [];
    const keyOf =
      mode === 'label'
        ? (r: LayerRow): string | null => r.label?.id ?? null
        : (r: LayerRow): string | null => r.layer.sectionId ?? null;
    const known =
      mode === 'label'
        ? this.labels().map((l) => l.id)
        : this.sections().map((s) => s.id);
    for (const id of known) buckets.set(id, []);
    for (const r of rows) {
      const k = keyOf(r);
      const bucket = k ? buckets.get(k) : undefined;
      if (bucket) {
        bucket.push(r);
      } else {
        fallback.push(r);
      }
    }

    const isHidingEmpty = isFiltering;
    const groups =
      mode === 'label'
        ? this.labels().map((l) => makeGroup(l.id, buckets.get(l.id)!, { label: l }))
        : this.sections().map((s) =>
            makeGroup(s.id, buckets.get(s.id)!, { title: s.title }),
          );
    if (fallback.length) {
      groups.push(makeGroup(FALLBACK_KEY, fallback, { isFallbackGroup: true }));
    }
    return isHidingEmpty ? groups.filter((g) => g.total > 0) : groups;
  });

  toggleGoals(): void {
    const isShown = !this.isGoalsShown();
    this.isGoalsShown.set(isShown);
    writeIsGoalsStripHidden(!isShown);
  }

  completeGoal(goal: TaskWithSubTasks): void {
    this._taskService.setDone(goal.id);
  }

  setViewMode(id: string | number): void {
    this.viewMode.set(id === 'time' || id === 'label' ? id : 'folder');
  }

  setSearchText(ev: Event): void {
    this.searchText.set((ev.target as HTMLInputElement).value);
  }

  toggleLabelFilter(labelId: string): void {
    this._labelFilter.update((ids) => {
      const next = new Set(ids);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
  }

  clearLabelFilter(): void {
    this._labelFilter.set(new Set());
  }

  setGroupExpanded(key: string, isExpanded: boolean): void {
    this._collapsedKeys.update((keys) => {
      const next = new Set(keys);
      if (isExpanded) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  showAll(key: string): void {
    this._showAllKeys.update((keys) => new Set(keys).add(key));
  }

  select(layer: Layer): void {
    this.selectedId.set(layer.id);
  }

  /** Folder and label default to the selected layer's (none if nothing selected). */
  async addLayer(): Promise<void> {
    const row = this.selectedRow();
    const id = await this._layerService.openAddLayerDialog(this.project().id, {
      sectionId: row?.layer.sectionId ?? null,
      labelId: row?.label?.id ?? null,
    });
    if (id) {
      this.selectedId.set(id);
    }
  }

  async addFolder(): Promise<void> {
    const title = await firstValueFrom(
      this._matDialog
        .open(DialogPromptComponent, {
          restoreFocus: true,
          data: { placeholder: T.F.LAYER.ADD_FOLDER_PROMPT },
        })
        .afterClosed(),
    );
    if (typeof title === 'string' && title.trim()) {
      this._sectionService.addSection(title, this.project().id, WorkContextType.PROJECT);
    }
  }

  openLabelManager(): void {
    this._matDialog.open<DialogLayerLabelsComponent, DialogLayerLabelsData>(
      DialogLayerLabelsComponent,
      { restoreFocus: true, data: { projectId: this.project().id } },
    );
  }

  rename(layer: Layer, ev: Event): void {
    const inputEl = ev.target as HTMLInputElement;
    const title = inputEl.value.trim();
    if (!title) {
      // A layer always has a name: an emptied field snaps back.
      inputEl.value = layer.title;
      return;
    }
    if (title !== layer.title) {
      this._layerService.updateLayer(layer.id, { title });
    }
  }

  moveToSection(layer: Layer, ev: Event): void {
    const sectionId = (ev.target as HTMLSelectElement).value || null;
    if (sectionId !== (layer.sectionId ?? null)) {
      this._layerService.updateLayer(layer.id, { sectionId });
    }
  }

  setLabel(row: LayerRow, ev: Event): void {
    const labelId = (ev.target as HTMLSelectElement).value || null;
    if (labelId !== (row.label?.id ?? null)) {
      this._layerService.updateLayer(row.layer.id, { labelId });
    }
  }

  async deleteLayer(layer: Layer): Promise<void> {
    const isConfirmed = await firstValueFrom(
      this._matDialog
        .open(DialogConfirmComponent, {
          restoreFocus: true,
          data: { message: T.F.LAYER.DELETE_CONFIRM },
        })
        .afterClosed(),
    );
    if (isConfirmed) {
      this._layerService.deleteLayer(layer);
      this.selectedId.set(null);
    }
  }

  chooseImage(): void {
    this._fileInput()?.nativeElement.click();
  }

  onFileChosen(layer: Layer, ev: Event): void {
    const inputEl = ev.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (file?.type.startsWith('image/')) {
      void this._layerService.setImage(layer, file);
    }
  }

  removeImage(layer: Layer): void {
    this._layerService.removeImage(layer);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }

  onDrop(layer: Layer, ev: DragEvent): void {
    const image = getImageFromDataTransfer(ev.dataTransfer);
    if (image) {
      ev.preventDefault();
      void this._layerService.setImage(layer, image);
    }
  }

  /**
   * Cmd/Ctrl+V anywhere on the Layers view puts a screenshot on the selected
   * layer. Pastes into text fields are left alone, so naming still works.
   */
  @HostListener('document:paste', ['$event'])
  onPaste(ev: ClipboardEvent): void {
    const layer = this.selectedLayer();
    if (!layer || this._isTextField(ev.target)) return;
    const image = getImageFromDataTransfer(ev.clipboardData);
    if (image) {
      ev.preventDefault();
      void this._layerService.setImage(layer, image);
    }
  }

  private _isTextField(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    );
  }
}
