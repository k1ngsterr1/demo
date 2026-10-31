import { Fault, MAX_BYTES, type Format } from './model';

export interface ByteReader {
  read(length: number): Promise<Uint8Array>;
  close(): void;
}

/** Bounds memory to 64 KiB and reads at most MAX_BYTES + 1, even with false/absent metadata. */
export async function inspectFile(
  reader: ByteReader,
  declaredSize?: number,
): Promise<{ size: number; format: Format }> {
  try {
    if (declaredSize !== undefined && declaredSize > MAX_BYTES) {
      throw new Fault('oversize');
    }
    let size = 0;
    let prefix = '';
    while (true) {
      const chunk = await reader.read(Math.min(64 * 1024, MAX_BYTES + 1 - size));
      if (!chunk.length) {
        break;
      }
      size += chunk.length;
      if (size > MAX_BYTES) {
        throw new Fault('oversize');
      }
      if (prefix.length < 32) {
        prefix += String.fromCharCode(...chunk.subarray(0, 32 - prefix.length));
      }
    }
    if (!size) {
      throw new Fault('unsupported');
    }
    const format = prefix.startsWith('%PDF-')
      ? 'pdf'
      : prefix.slice(0, 24).replace(/\r/g, '').startsWith('date,description,amount\n')
        ? 'csv'
        : null;
    if (!format) {
      throw new Fault('unsupported');
    }
    return { size, format };
  } finally {
    reader.close();
  }
}
