import { crc32 } from './zip-store.util';

/**
 * Reads a stored ZIP back via its central directory, as an unzip tool would,
 * checking signatures and CRCs on the way. Test-only.
 */
export const readStoredZip = async (blob: Blob): Promise<Map<string, Uint8Array>> => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  const endAt = buf.length - 22;
  if (view.getUint32(endAt, true) !== 0x06054b50) throw new Error('no end record');
  const count = view.getUint16(endAt + 10, true);
  let p = view.getUint32(endAt + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const localAt = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error('bad local header');
    const localNameLen = view.getUint16(localAt + 26, true);
    const dataAt = localAt + 30 + localNameLen;
    const data = buf.subarray(dataAt, dataAt + size);
    if (crc32(data) !== crc) throw new Error(`crc mismatch for ${name}`);
    files.set(name, data);
    p += 46 + nameLen;
  }
  return files;
};
