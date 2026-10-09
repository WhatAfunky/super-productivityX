import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { LayerService } from './layer.service';
import { Layer } from './layer.model';
import {
  addLayer,
  deleteLayer,
  moveLayerToProject,
  updateLayer,
} from './store/layer.actions';
import { SnackService } from '../../core/snack/snack.service';
import { LayerImageService } from './layer-image.service';
import { LayerOrganizeService } from './layer-organize.service';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { SectionService } from '../section/section.service';
import { LayerLabelService } from './layer-label.service';
import { selectAllLayers, selectLayersByProjectIdMap } from './store/layer.selectors';
import { selectLayerLabelEntities } from './store/layer-label.selectors';
import { DialogAddLayerData } from './dialog-add-layer/dialog-add-layer.component';
import { LayerLabel } from './layer-label.model';

describe('LayerService', () => {
  let service: LayerService;
  let store: MockStore;
  let dispatchSpy: jasmine.Spy;
  let images: jasmine.SpyObj<LayerImageService>;
  let snack: jasmine.SpyObj<SnackService>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let addLabel: jasmine.Spy;

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
    images = jasmine.createSpyObj<LayerImageService>('LayerImageService', [
      'save',
      'copy',
      'delete',
      'deleteOrphans',
    ]);
    images.delete.and.resolveTo();
    snack = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    addLabel = jasmine.createSpy('addLabel').and.returnValue('createdLabel');
    TestBed.configureTestingModule({
      providers: [
        LayerService,
        provideMockStore(),
        { provide: LayerImageService, useValue: images },
        { provide: LayerOrganizeService, useValue: { topKeyFor: async () => null } },
        { provide: TranslateService, useValue: { instant: () => 'copy' } },
        { provide: SnackService, useValue: snack },
        { provide: MatDialog, useValue: dialog },
        {
          provide: SectionService,
          useValue: { getSectionsByContextId$: () => of([{ id: 's1' }, { id: 's2' }]) },
        },
        {
          provide: LayerLabelService,
          useValue: {
            getVisibleLabelsByProjectId$: () => of([{ id: 'code' }]),
            addLabel,
          },
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
    it('saves the image, points the layer at it and drops the old image', async () => {
      images.save.and.resolveTo('layer-new');

      const ok = await service.setImage(layer({ imageId: 'layer-old' }), new Blob(['x']));

      expect(ok).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledOnceWith(
        updateLayer({ layer: { id: 'l1', changes: { imageId: 'layer-new' } } }),
      );
      expect(images.delete).toHaveBeenCalledOnceWith('layer-old');
    });

    it('changes nothing and tells the user when saving fails', async () => {
      images.save.and.resolveTo(null);

      const ok = await service.setImage(layer({ imageId: 'layer-keep' }), new Blob());

      expect(ok).toBe(false);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(images.delete).not.toHaveBeenCalled();
      expect(snack.open).toHaveBeenCalled();
    });
  });

  describe('duplicateLayer', () => {
    it('adds one copy on top with the same folder, label and a copied screenshot', async () => {
      images.copy.and.resolveTo('layer-copied');
      const original = layer({ sectionId: 's1', labelId: 'code', imageId: 'layer-orig' });

      const id = await service.duplicateLayer(original);

      expect(images.copy).toHaveBeenCalledOnceWith('layer-orig');
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const action = dispatchSpy.calls.mostRecent().args[0] as ReturnType<
        typeof addLayer
      >;
      expect(action.layer).toEqual(
        jasmine.objectContaining({
          id: id!,
          projectId: 'p1',
          title: 'Something exists copy',
          sectionId: 's1',
          labelId: 'code',
          imageId: 'layer-copied',
        }),
      );
      expect(action.layer.id).not.toBe(original.id);
      expect(action.layer.createdAt).toBeGreaterThan(original.createdAt);
    });

    it('copies without an image when the original has none', async () => {
      await service.duplicateLayer(layer());
      expect(images.copy).not.toHaveBeenCalled();
      const action = dispatchSpy.calls.mostRecent().args[0] as ReturnType<
        typeof addLayer
      >;
      expect(action.layer.imageId).toBeNull();
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

    it("prefers the open Layers view's selection over the newest layer", async () => {
      openWith(undefined);
      const unregister = service.registerSelectionDefaults('p1', () => ({
        sectionId: 's1',
        labelId: null,
      }));
      await service.openAddLayerDialog('p1');
      expect(dialogData().defaultSectionId).toBe('s1');

      unregister();
      await service.openAddLayerDialog('p1');
      expect(dialogData().defaultSectionId).toBe('s2');
    });

    it('attaches a pasted image to the new layer', async () => {
      images.save.and.resolveTo('layer-pasted');
      openWith({ title: 'Pasted', sectionId: null, labelId: null });
      const id = await service.openAddLayerDialog('p1', undefined, new Blob(['png']));
      expect(dialogData().imagePreviewUrl).toMatch(/^blob:/);
      expect(dispatchSpy).toHaveBeenCalledWith(
        updateLayer({ layer: { id: id!, changes: { imageId: 'layer-pasted' } } }),
      );
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
    expect(images.delete).toHaveBeenCalledOnceWith('layer-abc');
  });

  it('deleteLayer dispatches the delete and removes its image', () => {
    service.deleteLayer(layer({ imageId: 'layer-abc' }));

    expect(dispatchSpy).toHaveBeenCalledOnceWith(deleteLayer({ id: 'l1' }));
    expect(images.delete).toHaveBeenCalledOnceWith('layer-abc');
  });

  it('deleteOrphanedImages keeps every image a layer still points at', async () => {
    store.overrideSelector(selectAllLayers, [
      layer({ imageId: 'layer-a' }),
      layer({ id: 'l2', imageId: null }),
    ]);
    images.deleteOrphans.and.resolveTo(0);
    await service.deleteOrphanedImages();
    expect(images.deleteOrphans).toHaveBeenCalledOnceWith(new Set(['layer-a']));
  });

  describe('moveToProject', () => {
    const label = (id: string, extra: Partial<LayerLabel>): LayerLabel => ({
      id,
      projectId: 'p1',
      name: id,
      color: 'blue',
      ...extra,
    });

    it('reuses the target label with the same name (case-insensitive)', async () => {
      store.overrideSelector(selectLayerLabelEntities, {
        ui: label('ui', { name: 'UI' }),
        targetUi: label('targetUi', { projectId: 'p2', name: 'ui' }),
      });
      await service.moveToProject(layer({ labelId: 'ui' }), 'p2');

      expect(addLabel).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledOnceWith(
        moveLayerToProject({ id: 'l1', projectId: 'p2', labelId: 'targetUi' }),
      );
    });

    it('creates the label in the target when missing, following merges', async () => {
      store.overrideSelector(selectLayerLabelEntities, {
        old: label('old', { name: 'SFX old', mergedIntoId: 'sfx' }),
        sfx: label('sfx', { name: 'SFX', color: 'green' }),
      });
      await service.moveToProject(layer({ labelId: 'old' }), 'p2');

      expect(addLabel).toHaveBeenCalledOnceWith('p2', 'SFX', 'green');
      expect(dispatchSpy).toHaveBeenCalledOnceWith(
        moveLayerToProject({ id: 'l1', projectId: 'p2', labelId: 'createdLabel' }),
      );
    });

    it('moves without a label, and ignores the same project', async () => {
      store.overrideSelector(selectLayerLabelEntities, {});
      await service.moveToProject(layer(), 'p1');
      expect(dispatchSpy).not.toHaveBeenCalled();

      await service.moveToProject(layer({ labelId: 'gone' }), 'p2');
      expect(dispatchSpy).toHaveBeenCalledOnceWith(
        moveLayerToProject({ id: 'l1', projectId: 'p2', labelId: null }),
      );
    });
  });
});
