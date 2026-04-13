import { writeFileSync, mkdirSync } from 'fs';

// Generate minimal 1x1 PNG placeholders (proper PNGs will be added later)
// For now, create simple colored PNGs using raw PNG bytes

function createPng(size) {
  // Minimal valid PNG: solid purple (#6c63ff) square
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a  // PNG signature
  ]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk - uncompressed deflate with raw RGB data
  const rowSize = 1 + size * 3;  // filter byte + RGB per pixel
  const rawData = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    rawData[y * rowSize] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const offset = y * rowSize + 1 + x * 3;
      rawData[offset] = 0x6c;     // R
      rawData[offset + 1] = 0x63; // G
      rawData[offset + 2] = 0xff; // B
    }
  }

  // Simple zlib wrapper (no compression)
  const deflateBlocks = [];
  let pos = 0;
  while (pos < rawData.length) {
    const remaining = rawData.length - pos;
    const blockSize = Math.min(remaining, 65535);
    const isLast = pos + blockSize >= rawData.length;
    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast ? 1 : 0;
    blockHeader.writeUInt16LE(blockSize, 1);
    blockHeader.writeUInt16LE(blockSize ^ 0xffff, 3);
    deflateBlocks.push(blockHeader);
    deflateBlocks.push(rawData.subarray(pos, pos + blockSize));
    pos += blockSize;
  }

  // Adler32
  let a = 1, b = 0;
  for (let i = 0; i < rawData.length; i++) {
    a = (a + rawData[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE((b << 16) | a);

  const zlibHeader = Buffer.from([0x78, 0x01]); // zlib header (no compression)
  const zlibData = Buffer.concat([zlibHeader, ...deflateBlocks, adler]);
  const idat = makeChunk('IDAT', zlibData);

  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`public/icons/icon-${size}.png`, createPng(size));
  console.log(`Created icon-${size}.png`);
}
