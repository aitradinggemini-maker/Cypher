// @vitest-environment node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import './setup-test';
import { describe, it, expect, vi } from 'vitest';
import { 
  Secret, 
  base64ToGlyphs, 
  glyphsToBase64, 
  encryptEntry, 
  decryptEntry, 
  uint8ArrayToBase64, 
  base64ToUint8Array 
} from './crypto';

// Mock argon2-browser to bypass Emscripten WASM-to-Node compilation & fetch issues during unit tests,
// while preserving the deterministic salt-based key derivation logic.
vi.mock('argon2-browser', () => {
  return {
    default: {
      hash: async ({ pass, salt }: any) => {
        const hash = new Uint8Array(32);
        // Simple deterministic byte mixer representation of the passcode + salt
        for (let i = 0; i < 32; i++) {
          const passChar = pass.charCodeAt(i % pass.length);
          const saltByte = salt ? salt[i % salt.length] : 0;
          hash[i] = (passChar ^ saltByte ^ i) & 0xff;
        }
        return { hash };
      }
    }
  };
});

describe('Secret Class (Memory Hygiene)', () => {
  it('should initialize and hold sensitive data correctly', () => {
    const raw = "super-secret-text";
    const sec = new Secret(raw);
    expect(sec.getString()).toBe(raw);
    sec.destroy();
    expect(() => sec.getString()).toThrow();
  });

  it('should clear buffer upon destruction', () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5]);
    const sec = new Secret(arr);
    const bytes = sec.getBytes();
    expect(bytes[0]).toBe(1);
    sec.destroy();
    expect(() => sec.getBytes()).toThrow();
  });
});

describe('Glyph Mode Encoding Bijection', () => {
  it('should form a perfect symmetric bijection (base64 <-> glyphs)', () => {
    const b64s = ["SGVsbG8sIHdvcmxkIQ==", "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dml3eHl6MTIzNDU2Nzg5MA==", "Plus/Slash+Test"];
    b64s.forEach(b64 => {
      const glyphs = base64ToGlyphs(b64);
      const restored = glyphsToBase64(glyphs);
      expect(restored).toBe(b64);
    });
  });
});

describe('End-To-End AES-256-GCM + Argon2id flow', () => {
  it('should encrypt and decrypt a valid entry successfully', async () => {
    const title = "My Confidential Memoir";
    const content = "This is some confidential diary written inside secure RAM.";
    const passcode = "CorrectPassword123#";

    const { envelopeB64 } = await encryptEntry(title, content, passcode);
    expect(envelopeB64).toBeDefined();
    expect(envelopeB64.length).toBeGreaterThan(33);

    const decrypted = await decryptEntry(title, envelopeB64, passcode);
    expect(decrypted).toBe(content);
  });

  it('should fail closed with a clear error if the password is wrong', async () => {
    const title = "My Confidential Memoir";
    const content = "This is some confidential diary written inside secure RAM.";
    const passcode = "CorrectPassword123#";

    const { envelopeB64 } = await encryptEntry(title, content, passcode);

    await expect(
      decryptEntry(title, envelopeB64, "WrongPassword!!!")
    ).rejects.toThrow("Tampered or wrong passcode");
  });

  it('should fail closed with clear error if the title (Associated Data) is modified', async () => {
    const title = "My Confidential Memoir";
    const content = "This is some confidential diary written inside secure RAM.";
    const passcode = "CorrectPassword123#";

    const { envelopeB64 } = await encryptEntry(title, content, passcode);

    await expect(
      decryptEntry("Modified Title", envelopeB64, passcode)
    ).rejects.toThrow("Tampered or wrong passcode");
  });
});
