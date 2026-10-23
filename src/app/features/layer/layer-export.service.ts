import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { Layer } from './layer.model';
import { LayerService } from './layer.service';
import { LayerImageService } from './layer-image.service';
import { selectLayerLabelEntities } from './store/layer-label.selectors';
import { resolveLayerLabel } from './layer-label.util';
import { SectionService } from '../section/section.service';
import { SnackService } from '../../core/snack/snack.service';
import { createStoredZip, ZipEntry } from './zip-store.util';
import { MIME_TYPE_EXTENSIONS } from '../../../../electron/shared-with-frontend/mime-type-mapping.const';
import { T } from '../../t.const';

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

const localDay = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Safe across macOS, Windows and Linux file systems. */
export const toSafeFileName = (name: string, maxLength = 80): string =>
  name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, maxLength) || 'layer';

const extensionFor = (blob: Blob): string =>
  MIME_TYPE_EXTENSIONS[blob.type as keyof typeof MIME_TYPE_EXTENSIONS] ?? '.png';

/**
 * Exports a project's screenshots as one ZIP, in timeline order (oldest
 * first, so the files read like the project's history), plus an index.md
 * listing every layer — including ones without a screenshot on this device.
 */
@Injectable({
  providedIn: 'root',
})
export class LayerExportService {
  private _store = inject(Store);
  private _layerService = inject(LayerService);
  private _layerImageService = inject(LayerImageService);
  private _sectionService = inject(SectionService);
  private _snackService = inject(SnackService);

  /** Returns the number of screenshots exported. */
  async exportProject(projectId: string, projectTitle: string): Promise<number> {
    const [layersNewestFirst, sections, labelEntities] = await Promise.all([
      firstValueFrom(this._layerService.getLayersByProjectId$(projectId)),
      firstValueFrom(this._sectionService.getSectionsByContextId$(projectId)),
      firstValueFrom(this._store.select(selectLayerLabelEntities)),
    ]);
    const layers: Layer[] = [...layersNewestFirst].reverse();
    const sectionTitle = new Map(sections.map((s) => [s.id, s.title]));
    const width = Math.max(3, String(layers.length).length);

    const entries: ZipEntry[] = [];
    const indexLines = [
      `# ${projectTitle}: layers`,
      '',
      '| # | Date | Folder | Label | Layer | File |',
      '|---|---|---|---|---|---|',
    ];
    let imageCount = 0;

    for (const [i, layer] of layers.entries()) {
      const nr = pad(i + 1, width);
      const day = localDay(layer.createdAt);
      const folder = (layer.sectionId && sectionTitle.get(layer.sectionId)) || '';
      const label = resolveLayerLabel(layer.labelId, labelEntities)?.name ?? '';
      const image = await this._layerImageService.getFull(layer.imageId);
      let fileName = '';
      if (image) {
        fileName = `${nr} ${day} ${toSafeFileName(layer.title)}${extensionFor(image)}`;
        entries.push({
          name: fileName,
          data: new Uint8Array(await image.arrayBuffer()),
          date: new Date(layer.createdAt),
        });
        imageCount++;
      }
      const cell = (v: string): string => v.replace(/\|/g, '\\|');
      indexLines.push(
        `| ${nr} | ${day} | ${cell(folder)} | ${cell(label)} | ${cell(layer.title)} | ${cell(fileName)} |`,
      );
    }

    if (!imageCount) {
      this._snackService.open({
        type: 'CUSTOM',
        ico: 'image',
        msg: T.F.LAYER.EXPORT_EMPTY,
      });
      return 0;
    }

    entries.push({
      name: 'index.md',
      data: new TextEncoder().encode(indexLines.join('\n') + '\n'),
    });
    this._downloadBlob(
      createStoredZip(entries),
      `${toSafeFileName(projectTitle, 60)} - layers.zip`,
    );
    return imageCount;
  }

  /**
   * A layer's auto-screenshot history as a ZIP of numbered images, oldest
   * first (any video tool can turn it into a timelapse). Returns the count.
   */
  async exportCaptures(layer: Layer): Promise<number> {
    const captures = await this._layerImageService.listCaptures(layer.id);
    const width = Math.max(3, String(captures.length).length);
    const entries: ZipEntry[] = [];
    for (const [i, capture] of captures.entries()) {
      const image = await this._layerImageService.getFull(capture.id);
      if (!image) continue;
      const d = new Date(capture.takenAt);
      const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
      entries.push({
        name: `${pad(i + 1, width)} ${localDay(capture.takenAt)} ${time}${extensionFor(image)}`,
        data: new Uint8Array(await image.arrayBuffer()),
        date: d,
      });
    }
    if (!entries.length) return 0;
    this._downloadBlob(
      createStoredZip(entries),
      `${toSafeFileName(layer.title, 60)} - captures.zip`,
    );
    return entries.length;
  }

  private _downloadBlob(blob: Blob, fileName: string): void {
    // Desktop browsers download it; Electron shows its save dialog.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
