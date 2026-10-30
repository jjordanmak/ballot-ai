/** Test-only builders for TIGER county files (fictional rows). */
import { deflateRawSync } from "node:zlib";

/** A dBASE III file with character fields (fictional rows). */
export function makeDbf(fields: string[], rows: Record<string, string>[], width = 20): Uint8Array {
  const headerLen = 32 + fields.length * 32 + 1;
  const recordLen = 1 + fields.length * width;
  const buf = Buffer.alloc(headerLen + rows.length * recordLen + 1);
  buf[0] = 0x03;
  buf.writeUInt32LE(rows.length, 4);
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recordLen, 10);
  fields.forEach((f, i) => {
    buf.write(f, 32 + i * 32, "latin1");
    buf[32 + i * 32 + 11] = 0x43; // "C"
    buf[32 + i * 32 + 16] = width;
  });
  buf[headerLen - 1] = 0x0d;
  rows.forEach((r, n) => {
    const at = headerLen + n * recordLen;
    buf[at] = 0x20;
    fields.forEach((f, i) => buf.write((r[f] ?? "").padEnd(width), at + 1 + i * width, "utf8"));
  });
  buf[buf.length - 1] = 0x1a;
  return new Uint8Array(buf);
}

/** A zip with deflated entries. */
export function makeZip(files: Record<string, Uint8Array>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}
