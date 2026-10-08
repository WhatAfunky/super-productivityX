/** Screenshots above this size are re-encoded to WebP before saving. */
export const REENCODE_THRESHOLD_BYTES = 1024 * 1024;
const REENCODE_QUALITY = 0.9;

/** Longest edge of a list thumbnail, in px (rows show ~64px; 2× + headroom). */
export const THUMBNAIL_MAX_EDGE = 256;
const THUMBNAIL_QUALITY = 0.8;

const THUMBNAIL_SUFFIX = '-thumb';

/** The thumbnail's storage id is derived from the image id, never stored. */
export const getLayerThumbnailId = (imageId: string): string =>
  `${imageId}${THUMBNAIL_SUFFIX}`;

const encode = async (
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/webp', quality });
};

/**
 * Large screenshots (Retina PNGs are often 4–8 MB) are re-encoded to WebP at
 * full resolution: visually the same, a fraction of the size, and under the
 * 2 MB limit the web build enforces. Small images, GIFs (animation) and
 * anything that doesn't get smaller are kept as they are.
 */
export const reencodeIfLarge = async (image: Blob): Promise<Blob> => {
  if (image.size <= REENCODE_THRESHOLD_BYTES || image.type === 'image/gif') {
    return image;
  }
  try {
    const bitmap = await createImageBitmap(image);
    const out = await encode(bitmap, bitmap.width, bitmap.height, REENCODE_QUALITY);
    bitmap.close();
    return out && out.size < image.size ? out : image;
  } catch {
    return image;
  }
};

/** A small WebP for list rows, or null if the image can't be decoded. */
export const makeThumbnail = async (image: Blob): Promise<Blob | null> => {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const out = await encode(
      bitmap,
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
      THUMBNAIL_QUALITY,
    );
    bitmap.close();
    return out;
  } catch {
    return null;
  }
};
