/**
 * A minimal ZIP writer: "stored" entries only (no compression). Screenshots are
 * already compressed (WebP/PNG), so deflate would gain nothing, and this keeps
 * the export free of new dependencies (repo rule: no new root packages).
 *
 * Supports what the export needs: up to 65,535 entries, each and the whole
 * archive under 4 GB (no ZIP64), UTF-8 file names.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  date?: Date;
}

let crcTable: Uint32Array | null = null;

const getCrcTable = (): Uint32Array => {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};

export const crc32 = (data: Uint8Array): number => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** MS-DOS date/time as used in ZIP headers. */
const dosDateTime = (d: Date): { time: number; date: number } => {
  const year = Math.max(1980, d.getFullYear());
  const yearBits = (year - 1980) << 9;
  const monthBits = (d.getMonth() + 1) << 5;
  const hourBits = d.getHours() << 11;
  const minuteBits = d.getMinutes() << 5;
  return {
    time: hourBits | minuteBits | Math.floor(d.getSeconds() / 2),
    date: yearBits | monthBits | d.getDate(),
  };
};

const UTF8_FLAG = 0x0800;

export const createStoredZip = (entries: readonly ZipEntry[]): Blob => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const { time, date } = dosDateTime(entry.date ?? new Date());
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(name, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra, comment, disk start, internal + external attributes stay 0
    cv.setUint32(42, offset, true); // offset of the local header
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, end] as BlobPart[], {
    type: 'application/zip',
  });
};
