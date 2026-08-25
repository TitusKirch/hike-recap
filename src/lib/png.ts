/**
 * Minimal PNG decoder for the terrain tiles.
 *
 * The DEM tiles are 8-bit RGB, non-interlaced — the one shape this handles.
 * Pulling in an image library for that would be more dependency than decoder,
 * and Node already ships the only hard part (inflate) in `node:zlib`.
 */
import { inflateSync } from 'node:zlib';

export type DecodedPng = { width: number; height: number; rgb: Uint8Array };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer: Buffer): DecodedPng {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (buffer[i] !== SIGNATURE[i]) {
      throw new Error('not a PNG');
    }
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8]!;
      colorType = body[9]!;
      interlace = body[12]!;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (
    bitDepth !== 8 ||
    interlace !== 0 ||
    (colorType !== 2 && colorType !== 6)
  ) {
    throw new Error(
      `unsupported PNG: depth ${bitDepth}, colour ${colorType}, interlace ${interlace}`
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 3);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos]!;
    pos += 1;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[pos + x]!;
      const a = x >= channels ? line[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + ((a + b) >> 1);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      line[x] = value & 0xff;
    }
    pos += stride;
    for (let x = 0; x < width; x += 1) {
      out[(y * width + x) * 3 + 0] = line[x * channels + 0]!;
      out[(y * width + x) * 3 + 1] = line[x * channels + 1]!;
      out[(y * width + x) * 3 + 2] = line[x * channels + 2]!;
    }
    prev.set(line);
  }

  return { width, height, rgb: out };
}
