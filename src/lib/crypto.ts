/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import argon2 from 'argon2-browser';

// -------------------------------------------------------------------------
// 1. Memory Hygiene Secret Class
// -------------------------------------------------------------------------
/**
 * A wrapper to protect sensitive buffers/strings.
 * Overwrites the underlying Uint8Array with secure random values before zeroing it out.
 * JS strings are immutable; this class helps guard the mutable Uint8Array buffers
 * used in Argon2 KDF and AES-GCM operations.
 */
export class Secret {
  private buffer: Uint8Array | null;

  constructor(data: Uint8Array | string) {
    if (typeof data === 'string') {
      this.buffer = new TextEncoder().encode(data);
    } else {
      this.buffer = new Uint8Array(data);
    }
  }

  public getBytes(): Uint8Array {
    if (!this.buffer) {
      throw new Error("Secret has been destroyed.");
    }
    return this.buffer;
  }

  public getString(): string {
    if (!this.buffer) {
      throw new Error("Secret has been destroyed.");
    }
    return new TextDecoder().decode(this.buffer);
  }

  public destroy(): void {
    if (this.buffer) {
      // Overwrite with cryptographically secure random values first
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(this.buffer);
      } else {
        // Fallback for Node / testing environments
        for (let i = 0; i < this.buffer.length; i++) {
          this.buffer[i] = Math.floor(Math.random() * 256);
        }
      }
      this.buffer.fill(0);
      this.buffer = null;
    }
  }
}

// -------------------------------------------------------------------------
// 2. SubtleCrypto Resolver (Cross-Environment)
// -------------------------------------------------------------------------
export async function getSubtleCrypto(): Promise<SubtleCrypto> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle;
  }
  // Dynamic import for server-side/vitest compliance
  const nodeCrypto = await import('crypto');
  return nodeCrypto.webcrypto.subtle as SubtleCrypto;
}

// -------------------------------------------------------------------------
// 3. Argon2id Key Derivation Function (KDF)
// -------------------------------------------------------------------------

/**
 * Derives a secure 256-bit key from the passcode using Argon2id.
 * memory=256 MiB (262144 KiB), iterations=4, parallelism=2, hashLen=32 bytes.
 */
export async function deriveKey(passcode: string, salt: Uint8Array): Promise<Secret> {
  if (typeof window !== 'undefined') {
    // Configure WASM fetch path for Web browsers (served statically from root)
    (window as any).argon2WasmPath = '/argon2.wasm';
  }

  try {
    const res = await argon2.hash({
      pass: passcode,
      salt: salt,
      time: 4,
      mem: 262144, // 256 MiB in KiB
      hashLen: 32,
      parallelism: 2,
      type: 2, // Argon2id
    });

    return new Secret(res.hash);
  } catch (err: any) {
    throw new Error(`Argon2 key derivation failed: ${err.message || err}`);
  }
}

// -------------------------------------------------------------------------
// 4. Base64 & Symmetric Encryption / Decryption Envelopes
// -------------------------------------------------------------------------
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
// 64 visually unambiguous visual printable glyphs (OCR friendly and distinct, no '=' to avoid conflicts with padding)
const GLYPH_ALPHABET  = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789#@$&%*?";

export function uint8ArrayToBase64(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin);
}

export function base64ToUint8Array(str: string): Uint8Array {
  const bin = atob(str.trim().replace(/\s/g, ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

/**
 * Bijective mapping: Base64 string -> Visually unambiguous Glyphs (purely visual encoding, no security claim)
 */
export function base64ToGlyphs(b64: string): string {
  let result = '';
  for (let i = 0; i < b64.length; i++) {
    const char = b64[i];
    if (char === '=') {
      result += '='; // Preserve padding
    } else {
      const idx = BASE64_ALPHABET.indexOf(char);
      if (idx !== -1) {
        result += GLYPH_ALPHABET[idx];
      } else {
        result += char;
      }
    }
  }
  return result;
}

/**
 * Bijective mapping: Visually unambiguous Glyphs -> Base64 string
 */
export function glyphsToBase64(glyphs: string): string {
  let result = '';
  for (let i = 0; i < glyphs.length; i++) {
    const char = glyphs[i];
    if (char === '=') {
      result += '=';
    } else {
      const idx = GLYPH_ALPHABET.indexOf(char);
      if (idx !== -1) {
        result += BASE64_ALPHABET[idx];
      } else {
        result += char;
      }
    }
  }
  return result;
}

export interface EncryptedEntry {
  envelopeB64: string;
}

/**
 * Encrypts a diary entry (title + content) with a passcode using Argon2id + AES-256-GCM.
 * Layout of binary payload:
 * magic(4) "CYP1" | version(1) | salt(16) | iv(12) | ciphertext+tag(N)
 */
export async function encryptEntry(
  title: string,
  content: string,
  passcode: string
): Promise<EncryptedEntry> {
  const isBrowser = typeof window !== 'undefined';
  const cryptoObj = isBrowser ? window.crypto : (await import('crypto')).webcrypto;

  // 1. Generate 16 bytes secure random Salt & 12 bytes secure random IV
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  (cryptoObj as any).getRandomValues(salt);
  (cryptoObj as any).getRandomValues(iv);

  // 2. Derive key from passcode using Argon2id
  const derivedSecret = await deriveKey(passcode, salt);
  const keyBytes = derivedSecret.getBytes();

  // 3. Setup SubtleCrypto and import Key
  const subtle = await getSubtleCrypto();
  const aesKey = await subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // 4. Bind title + version metadata to Associated Authenticated Data (AAD)
  // This completely neutralizes database swap or ciphertext transfer/renaming attacks.
  const version = 1;
  const encoder = new TextEncoder();
  const aadBytes = encoder.encode(`${title}|${version}`);

  const plaintextBytes = encoder.encode(content);

  // 5. Run Symmetric AES-256-GCM Encryption
  const ciphertextBuffer = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      additionalData: aadBytes,
      tagLength: 128
    },
    aesKey,
    plaintextBytes
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);

  // 6. Assemble secure binary envelope
  const envelope = new Uint8Array(4 + 1 + 16 + 12 + ciphertext.length);
  // Magic bytes "CYP1"
  envelope.set([67, 89, 80, 49], 0);
  // Version byte 1
  envelope.set([version], 4);
  // Salt
  envelope.set(salt, 5);
  // IV
  envelope.set(iv, 21);
  // Ciphertext + authentication tag
  envelope.set(ciphertext, 33);

  // 7. Cleanup sensitive material in memory
  derivedSecret.destroy();

  return {
    envelopeB64: uint8ArrayToBase64(envelope)
  };
}

/**
 * Decrypts an envelope using the title + passcode.
 * Recreates KDF and verifies authenticated tag. Fails closed dynamically on mismatch.
 */
export async function decryptEntry(
  title: string,
  envelopeB64: string,
  passcode: string
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToUint8Array(envelopeB64);
  } catch (err) {
    throw new Error("Format Corrupted: Decryption envelope base64 structure is malformed.");
  }

  if (bytes.length < 33) {
    throw new Error("Format Corrupted: Decryption envelope payload is truncated.");
  }

  // 1. Verify header magic "CYP1"
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "CYP1") {
    throw new Error("Alg Failure: Invalid file or visual glyph signature. Untrusted cipher.");
  }

  const version = bytes[4];
  if (version !== 1) {
    throw new Error("Version Mismatch: Future envelope version not supported.");
  }

  // 2. Parse out KDF Salt, IV, and the remainder ciphertext + tag bytes
  const salt = bytes.slice(5, 21);
  const iv = bytes.slice(21, 33);
  const ciphertext = bytes.slice(33);

  // 3. Derive key from passcode using identical parameters
  const derivedSecret = await deriveKey(passcode, salt);
  const keyBytes = derivedSecret.getBytes();

  // 4. SubtleCrypto preparation
  const subtle = await getSubtleCrypto();
  const aesKey = await subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // 5. Re-evaluate Associated Authenticated Data (AAD) based on local state (title)
  const encoder = new TextEncoder();
  const aadBytes = encoder.encode(`${title}|${version}`);

  try {
    // 6. Decrypt and check authentication tag
    const plaintextBuffer = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: aadBytes,
        tagLength: 128
      },
      aesKey,
      ciphertext
    );

    derivedSecret.destroy();
    return new TextDecoder().decode(plaintextBuffer);
  } catch (err: any) {
    derivedSecret.destroy();
    throw new Error("Tampered or wrong passcode: Verification authentication tag checked out invalid.");
  }
}

// -------------------------------------------------------------------------
// 5. Native SHA-256 Digest for Dynamic Storage Keys (Plausible Deniability)
// -------------------------------------------------------------------------
export async function sha256(input: string): Promise<string> {
  const subtle = await getSubtleCrypto();
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

