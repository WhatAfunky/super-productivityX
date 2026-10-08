import { crc32, createStoredZip } from './zip-store.util';
import { readStoredZip } from './zip-store.test-helper';

describe('zip-store.util', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a valid archive that reads back byte for byte, with UTF-8 names', async () => {
    const a = new Uint8Array([1, 2, 3, 255]);
    const b = new TextEncoder().encode('# Index\n');
    const zip = createStoredZip([
      { name: '001 Ébauche – storyboard.webp', data: a, date: new Date(2026, 9, 6) },
      { name: 'index.md', data: b },
    ]);

    const files = await readStoredZip(zip);

    expect([...files.keys()]).toEqual(['001 Ébauche – storyboard.webp', 'index.md']);
    expect([...files.get('001 Ébauche – storyboard.webp')!]).toEqual([...a]);
    expect(new TextDecoder().decode(files.get('index.md'))).toBe('# Index\n');
  });
});
