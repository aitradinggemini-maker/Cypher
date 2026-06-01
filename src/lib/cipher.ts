// A dynamic, passcode-backed cryptographic mathematical engine.
// Absolutely zero static maps are hardcoded in the source code.
// Every key generates a mathematically distinct letter and number substitution set.

import CryptoJS from 'crypto-js';

export interface CipherKeyPair {
  passcode: string;
}

// 128-bit hash function to seed the PRNG from user's passcode string
export function cyrb128(str: string): number[] {
  let h1 = 1779033703, h2 = 3024733165, h3 = 3362453659, h4 = 50249321;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

// 32-bit PRNG function for uniform, deterministic float generation
export function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getCipherMaps(passcode: string): CipherKeyPair {
  const cleanPasscode = passcode || "crypt_diary_default_secure_salt_772";
  return { passcode: cleanPasscode };
}

/**
 * 1. Primary Encryption: Cascading Autokey Stream Cipher
 * Encrypts alphanumeric characters with sliding random-symmetry based on the previous character code, 
 * keeping paragraphs, spacing, and punctuation 100% intact so OCR reading runs perfectly.
 */
export function encodeWithCascadingAutokey(text: string, passcode: string): string {
  const cleanPasscode = passcode || "crypt_diary_default_secure_salt_772";
  const seeds = cyrb128(cleanPasscode);
  const prng = mulberry32(seeds[0]);

  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";

  let lastCharVal = 0;

  return text
    .split("")
    .map((char) => {
      const randVal = prng();
      
      if (lowercase.includes(char)) {
        const origIdx = lowercase.indexOf(char);
        const shift = Math.floor(randVal * 26) + lastCharVal;
        const newIdx = (origIdx + shift) % 26;
        lastCharVal = origIdx; // feedback plaintext index reference for customized symmetry cascade
        return lowercase[newIdx];
      } else if (uppercase.includes(char)) {
        const origIdx = uppercase.indexOf(char);
        const shift = Math.floor(randVal * 26) + lastCharVal;
        const newIdx = (origIdx + shift) % 26;
        lastCharVal = origIdx; 
        return uppercase[newIdx];
      } else if (digits.includes(char)) {
        const origIdx = digits.indexOf(char);
        const shift = Math.floor(randVal * 10) + lastCharVal;
        const newIdx = (origIdx + shift) % 10;
        lastCharVal = origIdx; 
        return digits[newIdx];
      }
      return char; // leave spaces, punctuation, symbols untouched to preserve visual structure
    })
    .join("");
}

/**
 * 1. Primary Decryption: Cascading Autokey Stream Cipher
 */
export function decodeWithCascadingAutokey(text: string, passcode: string): string {
  const cleanPasscode = passcode || "crypt_diary_default_secure_salt_772";
  const seeds = cyrb128(cleanPasscode);
  const prng = mulberry32(seeds[0]);

  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";

  let lastCharVal = 0;

  return text
    .split("")
    .map((char) => {
      const randVal = prng();

      if (lowercase.includes(char)) {
        const encryptedIdx = lowercase.indexOf(char);
        const shift = Math.floor(randVal * 26) + lastCharVal;
        let origIdx = (encryptedIdx - (shift % 26)) % 26;
        if (origIdx < 0) origIdx += 26;
        lastCharVal = origIdx; // feedback reconstructed plaintext character index
        return lowercase[origIdx];
      } else if (uppercase.includes(char)) {
        const encryptedIdx = uppercase.indexOf(char);
        const shift = Math.floor(randVal * 26) + lastCharVal;
        let origIdx = (encryptedIdx - (shift % 26)) % 26;
        if (origIdx < 0) origIdx += 26;
        lastCharVal = origIdx; 
        return uppercase[origIdx];
      } else if (digits.includes(char)) {
        const encryptedIdx = digits.indexOf(char);
        const shift = Math.floor(randVal * 10) + lastCharVal;
        let origIdx = (encryptedIdx - (shift % 10)) % 10;
        if (origIdx < 0) origIdx += 10;
        lastCharVal = origIdx; 
        return digits[origIdx];
      }
      return char;
    })
    .join("");
}

/**
 * 2. Legacy Decryption: Deterministic Stream with 4-char IV dot prefix (e.g. abcd.payload)
 */
export function decodeWithLegacyStream(text: string, passcode: string): string {
  const parts = text.split(".");
  let iv = "";
  let payload = text;
  
  if (parts.length >= 2 && parts[0].length === 4) {
    iv = parts[0];
    payload = text.substring(5);
  } else {
    iv = "";
    payload = text;
  }

  const seeds = cyrb128(passcode + iv);
  const prng = mulberry32(seeds[0]);

  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";

  return payload
    .split("")
    .map((char) => {
      const shift = Math.floor(prng() * 100000);

      if (lowercase.includes(char)) {
        const encryptedIdx = lowercase.indexOf(char);
        let origIdx = (encryptedIdx - (shift % lowercase.length)) % lowercase.length;
        if (origIdx < 0) origIdx += lowercase.length;
        return lowercase[origIdx];
      } else if (uppercase.includes(char)) {
        const encryptedIdx = uppercase.indexOf(char);
        let origIdx = (encryptedIdx - (shift % uppercase.length)) % uppercase.length;
        if (origIdx < 0) origIdx += uppercase.length;
        return uppercase[origIdx];
      } else if (digits.includes(char)) {
        const encryptedIdx = digits.indexOf(char);
        let origIdx = (encryptedIdx - (shift % digits.length)) % digits.length;
        if (origIdx < 0) origIdx += digits.length;
        return digits[origIdx];
      }
      return char;
    })
    .join("");
}

/**
 * 3. AES Decryption Decryptor for any pasted hexadecimal block strings
 */
export function decodeWithAES(text: string, passcode: string): string {
  try {
    const cleanHex = text.replace(/\s/g, '');
    const wordArray = CryptoJS.enc.Hex.parse(cleanHex);
    const base64Str = CryptoJS.enc.Base64.stringify(wordArray);
    
    const decrypted = CryptoJS.AES.decrypt(base64Str, passcode);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return "";
  }
}

// Master interface mapping: redirects primary flow to Cascading Autokey
export function encodeWithMaps(text: string, maps: CipherKeyPair): string {
  if (!text) return "";
  return encodeWithCascadingAutokey(text, maps.passcode);
}

// Master decoder interface: Automatically detects format type (AES hex vs Legacy IV stream vs Cascading stream)
export function decodeWithMaps(text: string, maps: CipherKeyPair): string {
  if (!text) return "";

  const cleanPasscode = maps.passcode || "crypt_diary_default_secure_salt_772";

  // Check if it's AES-256 hex encrypted string (only characters 0-9, a-f, spaces, newlines)
  const isAllHex = /^[0-9a-fA-F\s\n\r]+$/.test(text);
  if (isAllHex && text.replace(/\s/g, '').length >= 16) {
    const aesDecrypted = decodeWithAES(text, cleanPasscode);
    if (aesDecrypted) return aesDecrypted;
  }

  // Check if it matches a legacy stream cipher with IV prefix (e.g., abcd.[payload])
  const hasLegacyIv = /^[a-zA-Z0-9]{4}\.[a-zA-Z0-9]+.*$/s.test(text);
  if (hasLegacyIv) {
    const legacyDecrypted = decodeWithLegacyStream(text, cleanPasscode);
    if (legacyDecrypted) return legacyDecrypted;
  }

  // Primary Default: Decrypt using Cascading Autokey Stream Cipher
  return decodeWithCascadingAutokey(text, cleanPasscode);
}
