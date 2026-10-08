import { inject, Injectable } from '@angular/core';
import { nanoid } from 'nanoid';
import { ClipboardImageService } from '../../core/clipboard-image/clipboard-image.service';
import { Log } from '../../core/log';
import { createLayerImageId, isValidLayerImageId } from './layer.util';
import { getLayerThumbnailId, makeThumbnail, reencodeIfLarge } from './layer-image.util';

/** Decoded image URLs kept alive; older ones are released (LRU). */
const MAX_CACHED_THUMBNAILS = 120;
const MAX_CACHED_FULL_IMAGES = 8;
/**
 * The orphan sweep never touches files younger than this: a screenshot is
 * saved a moment before the layer pointing at it is updated.
 */
const ORPHAN_MIN_AGE_MS = 60 * 1000;

/** A tiny LRU of blob: URLs that revokes what it evicts. */
class BlobUrlCache {
  private _map = new Map<string, string>();

  constructor(private readonly _max: number) {}

  get(key: string): string | undefined {
    const url = this._map.get(key);
    if (url) {
      // Re-insert to mark as most recently used.
      this._map.delete(key);
      this._map.set(key, url);
    }
    return url;
  }

  set(key: string, url: string): void {
    this._map.set(key, url);
    while (this._map.size > this._max) {
      const [oldestKey, oldestUrl] = this._map.entries().next().value as [string, string];
      URL.revokeObjectURL(oldestUrl);
      this._map.delete(oldestKey);
    }
  }

  delete(key: string): void {
    const url = this._map.get(key);
    if (url) URL.revokeObjectURL(url);
    this._map.delete(key);
  }
}

/**
 * Device-local storage for layer screenshots (on top of ClipboardImageService).
 * Each screenshot has a full image (the record) and a derived thumbnail for
 * list rows. Ids are opaque (`layer-<nanoid>`); only ids of that exact shape
 * are ever read or deleted, because synced ids end up in file names.
 */
@Injectable({
  providedIn: 'root',
})
export class LayerImageService {
  private _clipboardImageService = inject(ClipboardImageService);
  private _thumbCache = new BlobUrlCache(MAX_CACHED_THUMBNAILS);
  private _fullCache = new BlobUrlCache(MAX_CACHED_FULL_IMAGES);

  /** Saves the image (re-encoded if large) plus its thumbnail. Returns the new id. */
  async save(image: Blob): Promise<string | null> {
    const imageId = createLayerImageId(nanoid());
    const full = await reencodeIfLarge(image);
    let savedUrl: string | null = null;
    try {
      savedUrl = await this._clipboardImageService.saveImage(full, imageId);
    } catch (e) {
      Log.err('[Layer] saving image failed');
    }
    if (!savedUrl) return null;
    await this._saveThumbnail(imageId, full);
    return imageId;
  }

  /** Copies an existing screenshot under a new id (for duplicating a layer). */
  async copy(imageId: string | null | undefined): Promise<string | null> {
    if (!isValidLayerImageId(imageId)) return null;
    const blob = await this._read(imageId);
    return blob ? this.save(blob) : null;
  }

  /** blob: URL of the full image, or null if it isn't on this device. */
  async resolveFull(imageId: string | null | undefined): Promise<string | null> {
    if (!isValidLayerImageId(imageId)) return null;
    const cached = this._fullCache.get(imageId);
    if (cached) return cached;
    const blob = await this._read(imageId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this._fullCache.set(imageId, url);
    return url;
  }

  /**
   * blob: URL of the thumbnail. Screenshots saved before thumbnails existed
   * get one generated (once) from the full image.
   */
  async resolveThumbnail(imageId: string | null | undefined): Promise<string | null> {
    if (!isValidLayerImageId(imageId)) return null;
    const cached = this._thumbCache.get(imageId);
    if (cached) return cached;
    let thumb = await this._read(getLayerThumbnailId(imageId));
    if (!thumb) {
      const full = await this._read(imageId);
      if (!full) return null;
      thumb = await this._saveThumbnail(imageId, full);
      if (!thumb) return null;
    }
    const url = URL.createObjectURL(thumb);
    this._thumbCache.set(imageId, url);
    return url;
  }

  /** Deletes a screenshot and its thumbnail from this device. */
  async delete(imageId: string | null | undefined): Promise<void> {
    if (!isValidLayerImageId(imageId)) return;
    this._thumbCache.delete(imageId);
    this._fullCache.delete(imageId);
    await Promise.all([
      this._deleteFile(imageId),
      this._deleteFile(getLayerThumbnailId(imageId)),
    ]);
  }

  /**
   * Deletes layer screenshot files on this device that no layer points at any
   * more (e.g. after a project was deleted). Only `layer-` files are touched,
   * and only ones older than a minute, so a screenshot being saved right now
   * is never caught.
   */
  async deleteOrphans(referencedImageIds: ReadonlySet<string>): Promise<number> {
    const keep = new Set<string>();
    for (const id of referencedImageIds) {
      keep.add(id);
      keep.add(getLayerThumbnailId(id));
    }
    const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
    let images: { id: string; createdAt: number }[] = [];
    try {
      images = await this._clipboardImageService.listImages();
    } catch {
      return 0;
    }
    const orphans = images.filter(
      (img) => isValidLayerImageId(img.id) && !keep.has(img.id) && img.createdAt < cutoff,
    );
    await Promise.all(orphans.map((img) => this._deleteFile(img.id)));
    return orphans.length;
  }

  private async _saveThumbnail(imageId: string, full: Blob): Promise<Blob | null> {
    const thumb = await makeThumbnail(full);
    if (!thumb) return null;
    try {
      await this._clipboardImageService.saveImage(thumb, getLayerThumbnailId(imageId));
    } catch {
      // The list falls back to generating it again next time.
    }
    return thumb;
  }

  private async _read(id: string): Promise<Blob | null> {
    try {
      return await this._clipboardImageService.getImage(id);
    } catch {
      return null;
    }
  }

  private async _deleteFile(id: string): Promise<void> {
    try {
      await this._clipboardImageService.deleteImage(id);
    } catch {
      // Already gone (or never on this device): nothing to clean up.
    }
  }
}
