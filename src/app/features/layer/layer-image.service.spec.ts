import { TestBed } from '@angular/core/testing';
import { LayerImageService } from './layer-image.service';
import { ClipboardImageService } from '../../core/clipboard-image/clipboard-image.service';
import { getLayerThumbnailId, REENCODE_THRESHOLD_BYTES } from './layer-image.util';
import { isValidLayerImageId } from './layer.util';

/** In-memory stand-in for the device storage ClipboardImageService wraps. */
class FakeImageStore {
  files = new Map<string, { blob: Blob; createdAt: number }>();
  saveImage = async (blob: Blob, id?: string): Promise<string | null> => {
    this.files.set(id!, { blob, createdAt: Date.now() });
    return `indexeddb://clipboard-images/${id}`;
  };
  getImage = async (id: string): Promise<Blob | null> => this.files.get(id)?.blob ?? null;
  deleteImage = async (id: string): Promise<boolean> => this.files.delete(id);
  listImages = async (): Promise<{ id: string; createdAt: number }[]> =>
    [...this.files.entries()].map(([id, f]) => ({ id, createdAt: f.createdAt }));
}

/**
 * A real PNG that behaves like a screenshot of artwork: smooth gradients with
 * fine noise. PNG stores the noise losslessly (big file); WebP doesn't need to.
 */
const makePng = async (width: number, height: number): Promise<Blob> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  let seed = 42;
  const noise = (): number => {
    const scaled = seed * 1103515245;
    seed = (scaled + 12345) & 0x7fffffff;
    return (seed % 17) - 8;
  };
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    const green = (y / height) * 255;
    for (let x = 0; x < width; x++) {
      const i = (rowStart + x) * 4;
      const red = (x / width) * 255;
      img.data[i] = red + noise();
      img.data[i + 1] = green + noise();
      img.data[i + 2] = 128 + noise();
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};

describe('LayerImageService', () => {
  let service: LayerImageService;
  let store: FakeImageStore;

  beforeEach(() => {
    store = new FakeImageStore();
    TestBed.configureTestingModule({
      providers: [LayerImageService, { provide: ClipboardImageService, useValue: store }],
    });
    service = TestBed.inject(LayerImageService);
  });

  it('saves the image under a layer id plus a small thumbnail', async () => {
    const id = await service.save(await makePng(800, 600));

    expect(isValidLayerImageId(id)).toBe(true);
    expect(store.files.has(id!)).toBe(true);
    const thumb = store.files.get(getLayerThumbnailId(id!))!.blob;
    const bitmap = await createImageBitmap(thumb);
    expect(Math.max(bitmap.width, bitmap.height)).toBeLessThanOrEqual(256);
  });

  it('re-encodes a large screenshot to a smaller WebP, keeping small ones as is', async () => {
    const big = await makePng(1600, 1200);
    expect(big.size).toBeGreaterThan(REENCODE_THRESHOLD_BYTES);
    const bigId = await service.save(big);
    const stored = store.files.get(bigId!)!.blob;
    expect(stored.type).toBe('image/webp');
    expect(stored.size).toBeLessThan(big.size);

    const small = await makePng(40, 40);
    const smallId = await service.save(small);
    expect(store.files.get(smallId!)!.blob).toBe(small);
  });

  it('generates a missing thumbnail (screenshots from before thumbnails)', async () => {
    store.files.set('layer-legacy', { blob: await makePng(600, 400), createdAt: 0 });

    const url = await service.resolveThumbnail('layer-legacy');

    expect(url).toMatch(/^blob:/);
    expect(store.files.has(getLayerThumbnailId('layer-legacy'))).toBe(true);
  });

  it('returns null for images not on this device and never reads foreign ids', async () => {
    spyOn(store, 'getImage').and.callThrough();
    expect(await service.resolveThumbnail('layer-elsewhere')).toBeNull();
    expect(await service.resolveFull('../../etc/passwd')).toBeNull();
    expect(store.getImage).not.toHaveBeenCalledWith('../../etc/passwd');
  });

  it('copy stores an independent file; delete removes image and thumbnail', async () => {
    const id = (await service.save(await makePng(100, 100)))!;
    const copyId = (await service.copy(id))!;
    expect(copyId).not.toBe(id);

    await service.delete(id);
    expect(store.files.has(id)).toBe(false);
    expect(store.files.has(getLayerThumbnailId(id))).toBe(false);
    expect(store.files.has(copyId)).toBe(true);
  });

  it('deleteOrphans removes only old, unreferenced layer files', async () => {
    const fiveMinutes = 5 * 60 * 1000;
    const old = Date.now() - fiveMinutes;
    const blob = new Blob(['x']);
    store.files.set('layer-kept', { blob, createdAt: old });
    store.files.set(getLayerThumbnailId('layer-kept'), { blob, createdAt: old });
    store.files.set('layer-orphan', { blob, createdAt: old });
    store.files.set('layer-justsaved', { blob, createdAt: Date.now() });
    store.files.set('clip-123-note-image', { blob, createdAt: old });

    const removed = await service.deleteOrphans(new Set(['layer-kept']));

    expect(removed).toBe(1);
    expect([...store.files.keys()].sort()).toEqual(
      [
        'clip-123-note-image',
        'layer-justsaved',
        'layer-kept',
        getLayerThumbnailId('layer-kept'),
      ].sort(),
    );
  });
});
