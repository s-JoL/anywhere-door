/**
 * Tests for SillyTavern Character Card V2 import.
 * Covers:
 *  - PNG tEXt chunk extraction (readPngTextChunks)
 *  - extractCardJson (PNG → parsed card)
 *  - parseCardFile (.json and .png paths)
 *  - cardToSeed (V2, V1-flat, missing name → null, garbage → null)
 */

import { describe, it, expect } from "vitest";
import { readPngTextChunks } from "../png";
import { extractCardJson, parseCardFile, cardToSeed } from "../character-card";
import type { ModelConfig } from "../../types";

// ---------------------------------------------------------------------------
// PNG builder helpers
// ---------------------------------------------------------------------------

/** Write a big-endian uint32 into a DataView. */
function writeUint32BE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, false /* big-endian */);
}

/** Encode a string as latin1 bytes. */
function latin1Encode(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** Build a single PNG chunk: [length:4][type:4][data][crc:4 zeros]. */
function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const length = data.length;
  const chunk = new Uint8Array(4 + 4 + length + 4);
  const view = new DataView(chunk.buffer);
  writeUint32BE(view, 0, length);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  // CRC: 4 zero bytes (we ignore CRC on read)
  return chunk;
}

/** Build a tEXt chunk from keyword + text (latin1). */
function buildTextChunk(keyword: string, text: string): Uint8Array {
  const kw = latin1Encode(keyword);
  const tx = latin1Encode(text);
  const data = new Uint8Array(kw.length + 1 + tx.length);
  data.set(kw, 0);
  data[kw.length] = 0; // null separator
  data.set(tx, kw.length + 1);
  return buildChunk("tEXt", data);
}

/** Build a minimal valid PNG: signature + one tEXt chunk + IEND. */
function buildMinimalPng(keyword: string, text: string): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const textChunk = buildTextChunk(keyword, text);
  const iendChunk = buildChunk("IEND", new Uint8Array(0));

  const total = sig.length + textChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let offset = 0;
  png.set(sig, offset); offset += sig.length;
  png.set(textChunk, offset); offset += textChunk.length;
  png.set(iendChunk, offset);
  return png;
}

// ---------------------------------------------------------------------------
// Base64 encode helper (test-side)
// ---------------------------------------------------------------------------
function toBase64(s: string): string {
  if (typeof btoa === "function") return btoa(s);
  return Buffer.from(s, "latin1").toString("base64");
}

/** latin1-encode a UTF-8 string via JSON (card text is JSON → ASCII-safe) */
function cardBase64(obj: unknown): string {
  const json = JSON.stringify(obj);
  return toBase64(json);
}

// ---------------------------------------------------------------------------
// Sample card data
// ---------------------------------------------------------------------------

const MODEL_CONFIG: ModelConfig = {
  provider: "openrouter",
  apiKey: "",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: false,
};

const V2_CARD = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Luna",
    description: "A mysterious traveler from the moon.",
    personality: "Calm and enigmatic.",
    scenario: "On a rooftop overlooking a neon city.",
    first_mes: "Hello, wanderer.",
    mes_example: "<START>\n{{user}}: Hi\n{{char}}: Hello.",
    system_prompt: "You are Luna. Speak in a dreamlike manner.",
    post_history_instructions: "Always end with a poetic line.",
    tags: ["fantasy", "sci-fi"],
    creator: "TestCreator",
  },
};

const V1_CARD = {
  // V1 flat — no spec/data wrapper
  name: "Marco",
  description: "A street-smart detective.",
  personality: "Brash but loyal.",
  scenario: "A rainy noir city.",
  system_prompt: "You are Marco Polo, detective.",
};

const V3_CARD = {
  spec: "chara_card_v3",
  data: {
    name: "Aria",
    description: "An AI companion.",
    scenario: "A futuristic lab.",
    system_prompt: "",
    post_history_instructions: "",
  },
};

// ---------------------------------------------------------------------------
// readPngTextChunks tests
// ---------------------------------------------------------------------------

describe("readPngTextChunks", () => {
  it("returns {} for non-PNG bytes", () => {
    expect(readPngTextChunks(new Uint8Array([0, 1, 2, 3]))).toEqual({});
    expect(readPngTextChunks(new Uint8Array([]))).toEqual({});
  });

  it("returns {} for truncated PNG (signature only)", () => {
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(readPngTextChunks(sig)).toEqual({});
  });

  it("extracts a tEXt chunk by keyword", () => {
    const png = buildMinimalPng("chara", "hello");
    const chunks = readPngTextChunks(png);
    expect(chunks["chara"]).toBe("hello");
  });

  it("extracts ccv3 keyword when present", () => {
    // Build PNG with both ccv3 and chara chunks
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ccv3Chunk = buildTextChunk("ccv3", "v3data");
    const charaChunk = buildTextChunk("chara", "v2data");
    const iendChunk = buildChunk("IEND", new Uint8Array(0));
    const png = new Uint8Array(sig.length + ccv3Chunk.length + charaChunk.length + iendChunk.length);
    let off = 0;
    png.set(sig, off); off += sig.length;
    png.set(ccv3Chunk, off); off += ccv3Chunk.length;
    png.set(charaChunk, off); off += charaChunk.length;
    png.set(iendChunk, off);
    const chunks = readPngTextChunks(png);
    expect(chunks["ccv3"]).toBe("v3data");
    expect(chunks["chara"]).toBe("v2data");
  });

  it("stops at IEND", () => {
    // Any chunks after IEND should be ignored
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const iendChunk = buildChunk("IEND", new Uint8Array(0));
    const afterChunk = buildTextChunk("after", "ignored");
    const png = new Uint8Array(sig.length + iendChunk.length + afterChunk.length);
    let off = 0;
    png.set(sig, off); off += sig.length;
    png.set(iendChunk, off); off += iendChunk.length;
    png.set(afterChunk, off);
    const chunks = readPngTextChunks(png);
    expect(chunks["after"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractCardJson tests
// ---------------------------------------------------------------------------

describe("extractCardJson", () => {
  it("extracts and parses a V2 card from PNG (chara keyword)", () => {
    const b64 = cardBase64(V2_CARD);
    const png = buildMinimalPng("chara", b64);
    const card = extractCardJson(png);
    expect(card).toBeTruthy();
    expect((card as typeof V2_CARD).data.name).toBe("Luna");
  });

  it("prefers ccv3 over chara when both present", () => {
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const v3b64 = cardBase64(V3_CARD);
    const v2b64 = cardBase64(V2_CARD);
    const ccv3Chunk = buildTextChunk("ccv3", v3b64);
    const charaChunk = buildTextChunk("chara", v2b64);
    const iendChunk = buildChunk("IEND", new Uint8Array(0));
    const png = new Uint8Array(sig.length + ccv3Chunk.length + charaChunk.length + iendChunk.length);
    let off = 0;
    png.set(sig, off); off += sig.length;
    png.set(ccv3Chunk, off); off += ccv3Chunk.length;
    png.set(charaChunk, off); off += charaChunk.length;
    png.set(iendChunk, off);
    const card = extractCardJson(png);
    expect((card as typeof V3_CARD).data.name).toBe("Aria");
  });

  it("returns null for garbage bytes", () => {
    expect(extractCardJson(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
  });

  it("returns null for PNG with no chara/ccv3 chunk", () => {
    const png = buildMinimalPng("unrelated", "data");
    expect(extractCardJson(png)).toBeNull();
  });

  it("returns null if base64 payload is not valid JSON", () => {
    const b64 = toBase64("not json {{{{");
    const png = buildMinimalPng("chara", b64);
    expect(extractCardJson(png)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseCardFile tests
// ---------------------------------------------------------------------------

describe("parseCardFile", () => {
  it("parses a .json file (V2 card)", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(V2_CARD));
    const card = parseCardFile("luna.json", bytes);
    expect((card as typeof V2_CARD).data.name).toBe("Luna");
  });

  it("parses a .JSON file (case-insensitive extension)", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(V1_CARD));
    const card = parseCardFile("marco.JSON", bytes);
    expect((card as typeof V1_CARD).name).toBe("Marco");
  });

  it("parses a .png file", () => {
    const b64 = cardBase64(V2_CARD);
    const png = buildMinimalPng("chara", b64);
    const card = parseCardFile("luna.png", png);
    expect((card as typeof V2_CARD).data.name).toBe("Luna");
  });

  it("returns null for garbage .json", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    expect(parseCardFile("bad.json", bytes)).toBeNull();
  });

  it("returns null for garbage .png", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(parseCardFile("bad.png", bytes)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cardToSeed tests
// ---------------------------------------------------------------------------

describe("cardToSeed", () => {
  it("converts a V2 card to a WorldSeed with source:'imported'", () => {
    const seed = cardToSeed(V2_CARD, MODEL_CONFIG, 1000, "abc123");
    expect(seed).not.toBeNull();
    expect(seed!.source).toBe("imported");
    expect(seed!.id).toBe("seed-import-abc123");
    expect(seed!.title).toBe("Luna");
  });

  it("has one character with correct name and systemPrompt mapped", () => {
    const seed = cardToSeed(V2_CARD, MODEL_CONFIG, 1000, "abc123");
    expect(seed!.characters).toHaveLength(1);
    const char = seed!.characters[0];
    expect(char.name).toBe("Luna");
    expect(char.systemPrompt).toBe("You are Luna. Speak in a dreamlike manner.");
    expect(char.postHistoryInstructions).toBe("Always end with a poetic line.");
  });

  it("includes description, personality, and mes_example in character description", () => {
    const seed = cardToSeed(V2_CARD, MODEL_CONFIG, 1000, "abc123");
    const desc = seed!.characters[0].description;
    expect(desc).toContain("mysterious traveler");
    expect(desc).toContain("性格：Calm and enigmatic.");
    expect(desc).toContain("对话范例：");
  });

  it("character is present in the opening location", () => {
    const seed = cardToSeed(V2_CARD, MODEL_CONFIG, 1000, "abc123");
    const locId = seed!.openingState.currentLocationId;
    expect(locId).toBe("scene");
    const loc = seed!.openingState.locations[locId];
    expect(loc).toBeDefined();
    expect(loc.presentCharacterIds).toContain(seed!.characters[0].id);
    // roster should also contain the character
    expect(seed!.openingState.roster[seed!.characters[0].id]).toBeDefined();
  });

  it("uses scenario as worldview when available", () => {
    const seed = cardToSeed(V2_CARD, MODEL_CONFIG, 1000, "abc123");
    expect(seed!.worldview).toBe("On a rooftop overlooking a neon city.");
  });

  it("falls back worldview when no scenario", () => {
    const cardNoScenario = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Bob", description: "A dude." } };
    const seed = cardToSeed(cardNoScenario, MODEL_CONFIG, 1000, "xyz");
    expect(seed!.worldview).toContain("Bob");
  });

  it("converts a V1 flat card (no spec/data wrapper)", () => {
    const seed = cardToSeed(V1_CARD, MODEL_CONFIG, 2000, "v1test");
    expect(seed).not.toBeNull();
    expect(seed!.title).toBe("Marco");
    expect(seed!.source).toBe("imported");
    expect(seed!.characters[0].systemPrompt).toBe("You are Marco Polo, detective.");
  });

  it("converts a V3 card (spec: chara_card_v3)", () => {
    const seed = cardToSeed(V3_CARD, MODEL_CONFIG, 3000, "v3test");
    expect(seed).not.toBeNull();
    expect(seed!.title).toBe("Aria");
  });

  it("returns null if card has no name", () => {
    const noName = { spec: "chara_card_v2", data: { description: "No name here." } };
    expect(cardToSeed(noName, MODEL_CONFIG, 1000, "nn")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(cardToSeed(null, MODEL_CONFIG, 1000, "null")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(cardToSeed({ random: "junk" }, MODEL_CONFIG, 1000, "junk")).toBeNull();
  });

  it("sets createdAt and modelConfig correctly", () => {
    const now = 99999;
    const seed = cardToSeed(V2_CARD, MODEL_CONFIG, now, "ts");
    expect(seed!.createdAt).toBe(now);
    expect(seed!.modelConfig).toEqual(MODEL_CONFIG);
  });

  it("omits systemPrompt/postHistoryInstructions when empty strings", () => {
    const seed = cardToSeed(V3_CARD, MODEL_CONFIG, 1000, "v3e");
    // V3_CARD has empty strings for system_prompt and post_history_instructions
    expect(seed!.characters[0].systemPrompt).toBeUndefined();
    expect(seed!.characters[0].postHistoryInstructions).toBeUndefined();
  });
});
