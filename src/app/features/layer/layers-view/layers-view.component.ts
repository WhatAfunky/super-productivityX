import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
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
import { AddLayerDefaults, LayerService } from '../layer.service';
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

// The chosen grouping is remembered per project on this device (a view
// preference, never synced). Same storage caveats as above.
const isLayerViewMode = (v: unknown): v is LayerViewMode =>
  v === 'folder' || v === 'label' || v === 'time';

const readViewModes = (): Record<string, LayerViewMode> => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(LS.LAYERS_VIEW_MODE_BY_PROJECT) || '{}',
    );
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, LayerViewMode>)
      : {};
  } catch {
    return {};
  }
};

const readViewMode = (projectId: string): LayerViewMode => {
  const modes = readViewModes();
  const mode = Object.hasOwn(modes, projectId) ? modes[projectId] : undefined;
  return isLayerViewMode(mode) ? mode : 'folder';
};

const writeViewMode = (projectId: string, mode: LayerViewMode): void => {
  try {
    const modes = readViewModes();
    modes[projectId] = mode;
    localStorage.setItem(LS.LAYERS_VIEW_MODE_BY_PROJECT, JSON.stringify(modes));
  } catch {
    // Not remembered this time.
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
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    CdkDropList,
    CdkDrag,
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
  private readonly _titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly _rowButtons = viewChildren<ElementRef<HTMLButtonElement>>('rowButton');

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

  constructor() {
    // Per project: restore the remembered grouping, and let Add layer from
    // elsewhere (the shortcut) default to this view's selection.
    effect((onCleanup) => {
      const projectId = this.project().id;
      this.viewMode.set(readViewMode(projectId));
      onCleanup(
        this._layerService.registerSelectionDefaults(projectId, () =>
          this._currentAddDefaults(),
        ),
      );
    });
  }

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

  /** The rows currently on screen, top to bottom (for keyboard navigation). */
  private readonly _navRows = computed<LayerRow[]>(() =>
    this.groups()
      .filter((g) => this.viewMode() === 'time' || g.isExpanded)
      .flatMap((g) => g.shown),
  );

  /** Folder reordering is offered in the folder view when nothing is filtered. */
  readonly isFolderReorderable = computed(
    () => this.viewMode() === 'folder' && !this.isFiltering(),
  );

  toggleGoals(): void {
    const isShown = !this.isGoalsShown();
    this.isGoalsShown.set(isShown);
    writeIsGoalsStripHidden(!isShown);
  }

  completeGoal(goal: TaskWithSubTasks): void {
    this._taskService.setDone(goal.id);
  }

  setViewMode(id: string | number): void {
    const mode: LayerViewMode = id === 'time' || id === 'label' ? id : 'folder';
    this.viewMode.set(mode);
    writeViewMode(this.project().id, mode);
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
  async addLayer(image?: Blob): Promise<void> {
    const id = await this._layerService.openAddLayerDialog(
      this.project().id,
      this._currentAddDefaults(),
      image,
    );
    if (id) {
      this.selectedId.set(id);
    }
  }

  async duplicateLayer(layer: Layer): Promise<void> {
    const id = await this._layerService.duplicateLayer(layer);
    if (id) {
      this.selectedId.set(id);
    }
  }

  /** Drag-and-drop of a folder header (folder view only). */
  dropFolder(event: CdkDragDrop<unknown>): void {
    const ids = this.sections().map((s) => s.id);
    // The unfiled group sits after the folders and can't move; clamp to them.
    const to = Math.min(event.currentIndex, ids.length - 1);
    if (event.previousIndex === to || event.previousIndex >= ids.length) return;
    moveItemInArray(ids, event.previousIndex, to);
    this._sectionService.updateSectionOrder(this.project().id, ids);
  }

  moveFolder(sectionId: string, delta: -1 | 1): void {
    const ids = this.sections().map((s) => s.id);
    const from = ids.indexOf(sectionId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    moveItemInArray(ids, from, to);
    this._sectionService.updateSectionOrder(this.project().id, ids);
  }

  private _currentAddDefaults(): AddLayerDefaults {
    const row = this.selectedRow();
    return { sectionId: row?.layer.sectionId ?? null, labelId: row?.label?.id ?? null };
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
    if (this._isTextField(ev.target) || this._matDialog.openDialogs.length) return;
    const image = getImageFromDataTransfer(ev.clipboardData);
    if (!image) return;
    ev.preventDefault();
    const layer = this.selectedLayer();
    if (layer) {
      void this._layerService.setImage(layer, image);
    } else {
      // Paste to create: screenshot first, name second.
      void this.addLayer(image);
    }
  }

  /**
   * ↑/↓ move the selection through the rows on screen, Enter renames the
   * selected layer, Delete deletes it (with confirm). Ignored while typing,
   * in dialogs, and on buttons other than layer rows (their own Enter wins).
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    if (this._matDialog.openDialogs.length || !this._isNavTarget(ev.target)) return;
    const layer = this.selectedLayer();
    switch (ev.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const rows = this._navRows();
        if (!rows.length) return;
        const index = rows.findIndex((r) => r.layer.id === layer?.id);
        const next =
          index < 0
            ? ev.key === 'ArrowDown'
              ? 0
              : rows.length - 1
            : Math.min(
                rows.length - 1,
                Math.max(0, index + (ev.key === 'ArrowDown' ? 1 : -1)),
              );
        ev.preventDefault();
        this.selectedId.set(rows[next].layer.id);
        this._focusSelectedRow(rows[next].layer.id);
        return;
      }
      case 'Enter':
        if (!layer) return;
        ev.preventDefault();
        this._titleInput()?.nativeElement.select();
        return;
      case 'Delete':
      case 'Backspace':
        if (!layer) return;
        ev.preventDefault();
        void this.deleteLayer(layer);
        return;
    }
  }

  private _focusSelectedRow(layerId: string): void {
    // After the selection renders: focus (and scroll to) the row.
    queueMicrotask(() => {
      this._rowButtons()
        .find((b) => b.nativeElement.dataset['layerId'] === layerId)
        ?.nativeElement.focus();
    });
  }

  /** Keyboard nav only from the page itself or a layer row. */
  private _isNavTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return true;
    if (this._isTextField(target) || target instanceof HTMLSelectElement) return false;
    if (target === document.body) return true;
    if (target.closest('.layer-row')) return true;
    return !target.closest('button, a, [role="button"], mat-dialog-container');
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
