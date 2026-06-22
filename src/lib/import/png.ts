/**
 * PNG tEXt chunk reader — read-only, defensive (never throws).
 * Spec: https://www.w3.org/TR/png/#11tEXt
 * We only extract tEXt chunks; we ignore CRC (read-only, not write).
 */

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

/**
 * Verify the 8-byte PNG signature.
 */
function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Read a big-endian uint32 from bytes at offset (bounds-checked).
 * Returns -1 if out of bounds.
 */
function readUint32BE(bytes: Uint8Array, offset: number): number {
  if (offset + 3 >= bytes.length) return -1;
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Decode bytes as latin1 (ISO-8859-1) string — required for tEXt chunks.
 */
function latin1Decode(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

/**
 * Walk PNG chunks and return all tEXt chunk keyword→text pairs.
 * Stops at IEND or end of bytes. Never throws on malformed input.
 */
export function readPngTextChunks(bytes: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};

  if (!isPng(bytes)) return result;

  // PNG layout: 8-byte sig, then chunks: [length:4][type:4][data:length][crc:4]
  let offset = 8;

  while (offset < bytes.length) {
    // Need at least 4 (length) + 4 (type) = 8 bytes to read a chunk header
    if (offset + 8 > bytes.length) break;

    const length = readUint32BE(bytes, offset);
    if (length < 0) break; // out of bounds

    // type is 4 ascii bytes
    const typeEnd = offset + 8;
    const chunkType = latin1Decode(bytes, offset + 4, typeEnd);

    // data starts at offset+8, length bytes, then 4 bytes CRC
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextChunkOffset = dataEnd + 4; // skip CRC

    // Bounds-check the data region
    if (dataEnd > bytes.length || nextChunkOffset > bytes.length + 4) {
      // Allow dataEnd to equal bytes.length (last chunk truncated CRC is ok since we skip CRC anyway)
      if (dataEnd > bytes.length) break;
    }

    if (chunkType === "IEND") break;

    if (chunkType === "tEXt" && length > 0) {
      // Find the null separator between keyword and text
      let nullPos = -1;
      for (let i = dataStart; i < dataEnd; i++) {
        if (bytes[i] === 0) {
          nullPos = i;
          break;
        }
      }
      if (nullPos !== -1) {
        const keyword = latin1Decode(bytes, dataStart, nullPos);
        const text = latin1Decode(bytes, nullPos + 1, dataEnd);
        result[keyword] = text;
      }
    }

    offset = nextChunkOffset;
  }

  return result;
}
