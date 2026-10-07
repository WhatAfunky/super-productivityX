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
import { switchMap } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { Project } from '../../project/project.model';
import { Layer } from '../layer.model';
import { LayerService } from '../layer.service';
import { SectionService } from '../../section/section.service';
import { Section } from '../../section/section.model';
import { WorkContextType } from '../../work-context/work-context.model';
import { getImageFromDataTransfer, MAX_LAYER_TITLE_LENGTH } from '../layer.util';
import { LayerImageComponent } from '../layer-image/layer-image.component';
import { CollapsibleComponent } from '../../../ui/collapsible/collapsible.component';
import {
  SegmentedButtonGroupComponent,
  SegmentedButtonOption,
} from '../../../ui/segmented-button-group/segmented-button-group.component';
import { DialogPromptComponent } from '../../../ui/dialog-prompt/dialog-prompt.component';
import { DialogConfirmComponent } from '../../../ui/dialog-confirm/dialog-confirm.component';
import {
  DialogAddLayerComponent,
  DialogAddLayerData,
  DialogAddLayerResult,
} from '../dialog-add-layer/dialog-add-layer.component';
import { LocaleDatePipe } from '../../../ui/pipes/locale-date.pipe';
import { DoneToggleComponent } from '../../../ui/done-toggle/done-toggle.component';
import { WorkContextService } from '../../work-context/work-context.service';
import { TaskService } from '../../tasks/task.service';
import { TaskWithSubTasks } from '../../tasks/task.model';
import { LS } from '../../../core/persistence/storage-keys.const';
import { T } from '../../../t.const';

type LayerViewMode = 'folder' | 'time';

interface LayerGroup {
  key: string;
  /** Section title; empty for the unfiled group (translated in the template). */
  title: string;
  isUnfiled: boolean;
  isExpanded: boolean;
  total: number;
  shown: readonly Layer[];
  hiddenCount: number;
}

/** Each group shows only its newest layers until "show older" is clicked. */
export const NEWEST_LAYERS_SHOWN = 8;
const UNFILED_KEY = '__unfiled__';
const TIMELINE_KEY = '__timeline__';
const EMPTY_SECTIONS: readonly Section[] = [];
const EMPTY_LAYERS: readonly Layer[] = [];
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
  private _layerService = inject(LayerService);
  private _sectionService = inject(SectionService);
  private _matDialog = inject(MatDialog);
  private _workContextService = inject(WorkContextService);
  private _taskService = inject(TaskService);

  readonly project = input.required<Project>();

  readonly T = T;
  readonly MAX_TITLE_LENGTH = MAX_LAYER_TITLE_LENGTH;
  readonly viewModeOptions: readonly SegmentedButtonOption[] = [
    { id: 'folder', labelKey: T.F.LAYER.VIEW_BY_FOLDER, icon: 'folder' },
    { id: 'time', labelKey: T.F.LAYER.VIEW_TIMELINE, icon: 'timeline' },
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
  private readonly _showAllKeys = signal<ReadonlySet<string>>(new Set());
  private readonly _collapsedKeys = signal<ReadonlySet<string>>(new Set());

  readonly selectedLayer = computed(
    () => this.layers().find((l) => l.id === this.selectedId()) ?? null,
  );

  readonly groups = computed<LayerGroup[]>(() => {
    const layers = this.layers();
    const showAll = this._showAllKeys();
    const collapsed = this._collapsedKeys();
    const makeGroup = (
      key: string,
      title: string,
      list: readonly Layer[],
      isUnfiled = false,
    ): LayerGroup => {
      const isShowAll = showAll.has(key);
      return {
        key,
        title,
        isUnfiled,
        isExpanded: !collapsed.has(key),
        total: list.length,
        shown: isShowAll ? list : list.slice(0, NEWEST_LAYERS_SHOWN),
        hiddenCount: isShowAll ? 0 : Math.max(0, list.length - NEWEST_LAYERS_SHOWN),
      };
    };

    if (this.viewMode() === 'time') {
      return [makeGroup(TIMELINE_KEY, '', layers)];
    }

    // Layers arrive newest first, so each bucket stays newest first.
    const sections = this.sections();
    const bySection = new Map<string, Layer[]>(sections.map((s) => [s.id, []]));
    const unfiled: Layer[] = [];
    for (const layer of layers) {
      const bucket = layer.sectionId ? bySection.get(layer.sectionId) : undefined;
      if (bucket) {
        bucket.push(layer);
      } else {
        unfiled.push(layer);
      }
    }
    const groups = sections.map((s) => makeGroup(s.id, s.title, bySection.get(s.id)!));
    if (unfiled.length) {
      groups.push(makeGroup(UNFILED_KEY, '', unfiled, true));
    }
    return groups;
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
    this.viewMode.set(id === 'time' ? 'time' : 'folder');
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

  /** The new layer's folder defaults to the selected layer's folder. */
  async addLayer(): Promise<void> {
    const result = await firstValueFrom(
      this._matDialog
        .open<DialogAddLayerComponent, DialogAddLayerData, DialogAddLayerResult>(
          DialogAddLayerComponent,
          {
            restoreFocus: true,
            data: {
              sections: this.sections(),
              defaultSectionId: this.selectedLayer()?.sectionId ?? null,
            },
          },
        )
        .afterClosed(),
    );
    if (!result) return;
    const id = this._layerService.addLayer(
      this.project().id,
      result.title,
      result.sectionId,
    );
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
