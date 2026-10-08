import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { LayerExportService, toSafeFileName } from './layer-export.service';
import { LayerService } from './layer.service';
import { LayerImageService } from './layer-image.service';
import { SectionService } from '../section/section.service';
import { SnackService } from '../../core/snack/snack.service';
import { selectLayerLabelEntities } from './store/layer-label.selectors';
import { Layer } from './layer.model';
import { readStoredZip } from './zip-store.test-helper';

describe('LayerExportService', () => {
  let service: LayerExportService;
  let snack: jasmine.SpyObj<SnackService>;
  let downloadSpy: jasmine.Spy;
  let layers: Layer[];

  const layer = (id: string, createdAt: number, extra: Partial<Layer> = {}): Layer => ({
    id,
    projectId: 'p1',
    title: id,
    createdAt,
    ...extra,
  });

  beforeEach(() => {
    // Newest first, as the selector delivers them.
    layers = [
      layer('Third: final', 3000, { imageId: 'layer-c' }),
      layer('No image', 2000),
      layer('First/sketch', 1000, {
        imageId: 'layer-a',
        sectionId: 's1',
        labelId: 'art',
      }),
    ];
    snack = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    TestBed.configureTestingModule({
      providers: [
        LayerExportService,
        provideMockStore(),
        { provide: SnackService, useValue: snack },
        { provide: LayerService, useValue: { getLayersByProjectId$: () => of(layers) } },
        {
          provide: SectionService,
          useValue: {
            getSectionsByContextId$: () => of([{ id: 's1', title: 'Planning' }]),
          },
        },
        {
          provide: LayerImageService,
          useValue: {
            getFull: async (id: string | null | undefined) =>
              id ? new Blob([id], { type: 'image/webp' }) : null,
          },
        },
      ],
    });
    TestBed.inject(MockStore).overrideSelector(selectLayerLabelEntities, {
      art: { id: 'art', projectId: 'p1', name: 'Art', color: 'pink' },
    });
    service = TestBed.inject(LayerExportService);
    downloadSpy = spyOn(
      service as unknown as { _downloadBlob: (blob: Blob, name: string) => void },
      '_downloadBlob',
    ).and.stub();
  });

  it('exports images oldest first with numbered, safe names plus an index of every layer', async () => {
    const count = await service.exportProject('p1', 'My Game');

    expect(count).toBe(2);
    const [blob, fileName] = downloadSpy.calls.mostRecent().args as [Blob, string];
    expect(fileName).toBe('My Game - layers.zip');
    const files = await readStoredZip(blob);
    expect([...files.keys()]).toEqual([
      jasmine.stringMatching(/^001 \d{4}-\d\d-\d\d First-sketch\.webp$/),
      jasmine.stringMatching(/^003 \d{4}-\d\d-\d\d Third- final\.webp$/),
      'index.md',
    ]);
    const index = new TextDecoder().decode(files.get('index.md'));
    expect(index).toContain('| Planning | Art | First/sketch |');
    expect(index).toContain('| 002 |');
    expect(index).toContain('No image |  |');
  });

  it('tells the user instead of exporting when no screenshot is on this device', async () => {
    layers = [layer('No image', 1)];
    expect(await service.exportProject('p1', 'My Game')).toBe(0);
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(snack.open).toHaveBeenCalled();
  });

  it('makes names safe for every file system', () => {
    expect(toSafeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(toSafeFileName('...hidden')).toBe('hidden');
    expect(toSafeFileName('   ')).toBe('layer');
  });
});
