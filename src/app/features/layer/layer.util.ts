import { IS_NATIVE_PLATFORM } from '../../util/is-native-platform';

export const MAX_LAYER_TITLE_LENGTH = 200;
export const MAX_LAYER_VISION_LENGTH = 2000;

/**
 * Authoritative title normalizer, applied in the reducer so it also holds
 * for replayed and remote ops. Non-string input returns `''`.
 */
export const sanitizeLayerTitle = (title: unknown): string =>
  typeof title === 'string' ? title.trim().slice(0, MAX_LAYER_TITLE_LENGTH) : '';

const LAYER_IMAGE_ID_PREFIX = 'layer-';
const LAYER_IMAGE_ID_RE = /^layer-[A-Za-z0-9_-]{1,64}$/;

export const createLayerImageId = (randomId: string): string =>
  `${LAYER_IMAGE_ID_PREFIX}${randomId}`;

/**
 * An `imageId` can arrive from another device via sync and ends up in a file
 * name on Electron, so only ids in the exact shape this feature creates are
 * ever resolved or deleted.
 */
export const isValidLayerImageId = (imageId: unknown): imageId is string =>
  typeof imageId === 'string' && LAYER_IMAGE_ID_RE.test(imageId);

/** First image in a paste or drop, or null. */
export const getImageFromDataTransfer = (data: DataTransfer | null): File | null => {
  if (!data) return null;
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (let i = 0; i < data.files.length; i++) {
    if (data.files[i].type.startsWith('image/')) return data.files[i];
  }
  return null;
};

/**
 * Layers are a desktop concept: hidden on the native mobile apps. The data
 * still exists in the store there (it syncs like any other slice), it is
 * just never shown.
 */
export const IS_LAYERS_PLATFORM_SUPPORTED = !IS_NATIVE_PLATFORM;
