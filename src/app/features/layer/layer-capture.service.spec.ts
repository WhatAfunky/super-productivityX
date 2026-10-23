import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateService } from '@ngx-translate/core';
import { LayerCaptureService } from './layer-capture.service';
import { LayerImageService } from './layer-image.service';
import { LayerService } from './layer.service';
import { LayerExportService } from './layer-export.service';
import { selectAllLayers, selectLayerById } from './store/layer.selectors';
import { selectCurrentTaskId } from '../tasks/store/task.selectors';
import { selectTimer } from '../focus-mode/store/focus-mode.selectors';
import { Layer } from './layer.model';
import { LS } from '../../core/persistence/storage-keys.const';
import { CAPTURE_WARN_STEP_BYTES, isCaptureId, LayerCapture } from './layer-capture.util';
import { CaptureResult } from '../../../../electron/shared-with-frontend/window-capture.model';
import { TimerState } from '../focus-mode/focus-mode.model';

describe('LayerCaptureService', () => {
  let service: LayerCaptureService;
  let store: MockStore;
  let images: jasmine.SpyObj<LayerImageService>;
  let layerService: jasmine.SpyObj<LayerService>;
  let captureWindow: jasmine.Spy;
  let captures: LayerCapture[];
  const target = { id: 'window:1:0', title: 'scene_02.moho' };
  const layer = (extra: Partial<Layer> = {}): Layer => ({
    id: 'L1',
    projectId: 'p1',
    title: 'Storyboard',
    createdAt: 0,
    ...extra,
  });
  const ok = (): CaptureResult => ({ ok: true, png: new Uint8Array([1, 2, 3]), target });

  const setLayer = (l: Layer): void => {
    store.overrideSelector(selectLayerById, l);
    store.overrideSelector(selectAllLayers, [l]);
    store.refreshState();
  };

  beforeEach(() => {
    localStorage.removeItem(LS.LAYER_CAPTURE_TARGETS);
    localStorage.removeItem(LS.LAYER_CAPTURE_WARN_ACK);
    captures = [];
    captureWindow = jasmine.createSpy('captureWindow').and.resolveTo(ok());
    Object.assign(window, {
      ea: {
        captureWindow,
        pickCaptureWindow: jasmine.createSpy('pick').and.resolveTo(target),
        getCapturePermission: jasmine.createSpy('perm').and.resolveTo('granted'),
        openCaptureSettings: jasmine.createSpy('settings'),
      },
    });
    images = jasmine.createSpyObj<LayerImageService>('LayerImageService', [
      'saveAs',
      'getFull',
      'listCaptures',
      'delete',
      'deleteMany',
    ]);
    images.saveAs.and.callFake(async (id: string) => id);
    images.getFull.and.resolveTo(new Blob(['manual']));
    images.listCaptures.and.callFake(async () => captures);
    images.delete.and.resolveTo();
    images.deleteMany.and.resolveTo();
    layerService = jasmine.createSpyObj<LayerService>('LayerService', [
      'setImageId',
      'removeImage',
    ]);
    TestBed.configureTestingModule({
      providers: [
        LayerCaptureService,
        provideMockStore(),
        { provide: LayerImageService, useValue: images },
        { provide: LayerService, useValue: layerService },
        { provide: LayerExportService, useValue: { exportCaptures: async () => 3 } },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentTaskId, null);
    store.overrideSelector(selectTimer, {
      isRunning: false,
      startedAt: null,
      elapsed: 0,
      duration: 0,
      purpose: null,
    } as TimerState);
    setLayer(layer());
    service = TestBed.inject(LayerCaptureService);
  });

  afterEach(() => {
    Object.assign(window, { ea: undefined });
    localStorage.removeItem(LS.LAYER_CAPTURE_TARGETS);
    localStorage.removeItem(LS.LAYER_CAPTURE_WARN_ACK);
  });

  it('picking a window turns capture on and remembers it on this device', async () => {
    expect(await service.pickWindow('L1')).toBe(true);
    expect(service.setting('L1')).toEqual({ target, isEnabled: true });
    expect(localStorage.getItem(LS.LAYER_CAPTURE_TARGETS)).toContain('scene_02.moho');
  });

  it('a capture is saved into the history and becomes the screenshot', async () => {
    await service.pickWindow('L1');
    expect(await service.captureNow('L1')).toBe(true);

    const savedId = images.saveAs.calls.mostRecent().args[0];
    expect(isCaptureId(savedId)).toBe(true);
    expect(layerService.setImageId).toHaveBeenCalledOnceWith(layer(), savedId);
  });

  it('a hand-added screenshot is moved into the history before the first capture', async () => {
    setLayer(layer({ imageId: 'layer-manual' }));
    await service.pickWindow('L1');
    await service.captureNow('L1');

    expect(images.saveAs).toHaveBeenCalledTimes(2);
    const adoptedId = images.saveAs.calls.first().args[0];
    expect(isCaptureId(adoptedId)).toBe(true);
    expect(layerService.setImageId.calls.first().args[1]).toBe(adoptedId);
  });

  it('a missing window is skipped and counted; no permission is reported', async () => {
    await service.pickWindow('L1');
    captureWindow.and.resolveTo({ ok: false, reason: 'not-found' });
    await service.captureNow('L1');
    await service.captureNow('L1');
    expect(service.skippedCount('L1')).toBe(2);
    expect(images.saveAs).not.toHaveBeenCalled();

    captureWindow.and.resolveTo({ ok: false, reason: 'permission' });
    await service.captureNow('L1');
    expect(service.permission()).toBe('denied');
  });

  it('nothing is captured for a layer without a chosen window', async () => {
    expect(await service.captureNow('L1')).toBe(false);
    expect(captureWindow).not.toHaveBeenCalled();
  });

  it('deleting the screenshot capture hands over to the newest other one', async () => {
    const a = { id: 'layer-cap-L1-a', layerId: 'L1', takenAt: 1, size: 1 };
    const b = { id: 'layer-cap-L1-b', layerId: 'L1', takenAt: 2, size: 1 };
    captures = [a, b];
    setLayer(layer({ imageId: b.id }));

    await service.deleteCapture('L1', b.id);

    expect(layerService.setImageId).toHaveBeenCalledOnceWith(
      layer({ imageId: b.id }),
      a.id,
    );
    expect(images.delete).toHaveBeenCalledOnceWith(b.id);
  });

  it('warns past each 100 MB until "Keep everything"', async () => {
    captures = [
      {
        id: 'layer-cap-L1-a',
        layerId: 'L1',
        takenAt: 1,
        size: CAPTURE_WARN_STEP_BYTES + 5,
      },
    ];
    await service.refreshStats();
    expect(service.warnLevel('L1')).toBe(CAPTURE_WARN_STEP_BYTES);
    expect(service.warnedLayerIds().has('L1')).toBe(true);

    service.keepEverything('L1');
    expect(service.warnLevel('L1')).toBe(0);
    expect(service.warnedLayerIds().has('L1')).toBe(false);
  });

  it('export & clear keeps the current screenshot', async () => {
    captures = [
      { id: 'layer-cap-L1-a', layerId: 'L1', takenAt: 1, size: 1 },
      { id: 'layer-cap-L1-b', layerId: 'L1', takenAt: 2, size: 1 },
    ];
    setLayer(layer({ imageId: 'layer-cap-L1-b' }));
    expect(await service.exportAndClear('L1')).toBe(3);
    expect(images.deleteMany).toHaveBeenCalledOnceWith(['layer-cap-L1-a']);
  });
});
