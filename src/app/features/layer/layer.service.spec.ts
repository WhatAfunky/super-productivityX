import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { LayerService } from './layer.service';
import { Layer } from './layer.model';
import { addLayer, deleteLayer, updateLayer } from './store/layer.actions';
import { ClipboardImageService } from '../../core/clipboard-image/clipboard-image.service';
import { SnackService } from '../../core/snack/snack.service';
import { isValidLayerImageId } from './layer.util';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { SectionService } from '../section/section.service';
import { LayerLabelService } from './layer-label.service';
import { selectLayersByProjectIdMap } from './store/layer.selectors';
import { selectLayerLabelEntities } from './store/layer-label.selectors';
import { DialogAddLayerData } from './dialog-add-layer/dialog-add-layer.component';
import { LayerLabel } from './layer-label.model';

describe('LayerService', () => {
  let service: LayerService;
  let store: MockStore;
  let dispatchSpy: jasmine.Spy;
  let images: jasmine.SpyObj<ClipboardImageService>;
  let snack: jasmine.SpyObj<SnackService>;
  let dialog: jasmine.SpyObj<MatDialog>;

  const layer = (overrides: Partial<Layer> = {}): Layer => ({
    id: 'l1',
    projectId: 'p1',
    title: 'Something exists',
    createdAt: 1,
    sectionId: null,
    imageId: null,
    ...overrides,
  });

  beforeEach(() => {
    images = jasmine.createSpyObj<ClipboardImageService>('ClipboardImageService', [
      'saveImage',
      'getImage',
      'deleteImage',
    ]);
    images.deleteImage.and.resolveTo(true);
    snack = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    TestBed.configureTestingModule({
      providers: [
        LayerService,
        provideMockStore(),
        { provide: ClipboardImageService, useValue: images },
        { provide: SnackService, useValue: snack },
        { provide: MatDialog, useValue: dialog },
        {
          provide: SectionService,
          useValue: { getSectionsByContextId$: () => of([{ id: 's1' }, { id: 's2' }]) },
        },
        {
          provide: LayerLabelService,
          useValue: { getVisibleLabelsByProjectId$: () => of([{ id: 'code' }]) },
        },
      ],
    });
    service = TestBed.inject(LayerService);
    store = TestBed.inject(MockStore);
    dispatchSpy = spyOn(store, 'dispatch');
  });

  describe('addLayer', () => {
    it('dispatches one addLayer op with a sanitized title', () => {
      const id = service.addLayer('p1', '  Animatic timed  ', 's1');

      expect(id).toEqual(jasmine.any(String));
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const action = dispatchSpy.calls.mostRecent().args[0] as ReturnType<
        typeof addLayer
      >;
      expect(action.type).toBe(addLayer.type);
      expect(action.layer).toEqual(
        jasmine.objectContaining({
          id: id!,
          projectId: 'p1',
          title: 'Animatic timed',
          sectionId: 's1',
          imageId: null,
        }),
      );
    });

    it('refuses an empty title', () => {
      expect(service.addLayer('p1', '   ', null)).toBeNull();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  describe('setImage', () => {
    it('saves under a fresh layer image id, points the layer at it and drops the old image', async () => {
      images.saveImage.and.resolveTo('file:///x.png');
      const old = 'layer-oldImage';

      const ok = await service.setImage(layer({ imageId: old }), new Blob(['x']));

      expect(ok).toBe(true);
      const newId = images.saveImage.calls.mostRecent().args[1]!;
      expect(isValidLayerImageId(newId)).toBe(true);
      expect(newId).not.toBe(old);
      expect(dispatchSpy).toHaveBeenCalledOnceWith(
        updateLayer({ layer: { id: 'l1', changes: { imageId: newId } } }),
      );
      expect(images.deleteImage).toHaveBeenCalledOnceWith(old);
    });

    it('changes nothing and tells the user when saving fails', async () => {
      images.saveImage.and.resolveTo(null);

      const ok = await service.setImage(layer({ imageId: 'layer-keep' }), new Blob());

      expect(ok).toBe(false);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(images.deleteImage).not.toHaveBeenCalled();
      expect(snack.open).toHaveBeenCalled();
    });
  });

  describe('openAddLayerDialog', () => {
    const labels: Record<string, LayerLabel> = {
      code: { id: 'code', projectId: 'p1', name: 'Code', color: 'blue' },
      sound: {
        id: 'sound',
        projectId: 'p1',
        name: 'Sound',
        color: 'red',
        mergedIntoId: 'code',
      },
    };
    const openWith = (result: unknown): void => {
      dialog.open.and.returnValue({ afterClosed: () => of(result) } as never);
    };
    const dialogData = (): DialogAddLayerData =>
      dialog.open.calls.mostRecent().args[1]!.data as DialogAddLayerData;

    beforeEach(() => {
      store.overrideSelector(
        selectLayersByProjectIdMap,
        new Map([['p1', [layer({ id: 'newest', sectionId: 's2', labelId: 'sound' })]]]),
      );
      store.overrideSelector(selectLayerLabelEntities, labels);
    });

    it("defaults to the newest layer's folder and resolved label", async () => {
      openWith(undefined);
      await service.openAddLayerDialog('p1');
      expect(dialogData().defaultSectionId).toBe('s2');
      expect(dialogData().defaultLabelId).toBe('code');
    });

    it('uses explicit defaults when given', async () => {
      openWith(undefined);
      await service.openAddLayerDialog('p1', { sectionId: null, labelId: null });
      expect(dialogData().defaultSectionId).toBeNull();
      expect(dialogData().defaultLabelId).toBeNull();
    });

    it('adds the layer from the dialog result, and nothing when cancelled', async () => {
      openWith({ title: 'Dash works', sectionId: 's1', labelId: 'code' });
      const id = await service.openAddLayerDialog('p1');
      const action = dispatchSpy.calls.mostRecent().args[0] as ReturnType<
        typeof addLayer
      >;
      expect(action.layer).toEqual(
        jasmine.objectContaining({
          id: id!,
          title: 'Dash works',
          sectionId: 's1',
          labelId: 'code',
        }),
      );

      dispatchSpy.calls.reset();
      openWith(undefined);
      expect(await service.openAddLayerDialog('p1')).toBeNull();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  it('removeImage clears the reference and deletes the file', () => {
    service.removeImage(layer({ imageId: 'layer-abc' }));

    expect(dispatchSpy).toHaveBeenCalledOnceWith(
      updateLayer({ layer: { id: 'l1', changes: { imageId: null } } }),
    );
    expect(images.deleteImage).toHaveBeenCalledOnceWith('layer-abc');
  });

  it('deleteLayer dispatches the delete and removes its image', () => {
    service.deleteLayer(layer({ imageId: 'layer-abc' }));

    expect(dispatchSpy).toHaveBeenCalledOnceWith(deleteLayer({ id: 'l1' }));
    expect(images.deleteImage).toHaveBeenCalledOnceWith('layer-abc');
  });

  it('never touches storage for an image id it did not create', async () => {
    service.deleteLayer(layer({ imageId: '../../etc/passwd' }));
    const url = await service.resolveImageUrl('clip-123-foreign');

    expect(url).toBeNull();
    expect(images.deleteImage).not.toHaveBeenCalled();
    expect(images.getImage).not.toHaveBeenCalled();
  });

  it('resolveImageUrl returns null when the image is not on this device', async () => {
    images.getImage.and.resolveTo(null);

    expect(await service.resolveImageUrl('layer-elsewhere')).toBeNull();
  });
});
