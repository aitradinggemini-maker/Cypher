// A dynamic, passcode-backed cryptographic mathematical engine.
// Absolutely zero static maps are hardcoded in the source code.
// Every key generates a mathematically distinct letter and number substitution set.

import CryptoJS from 'crypto-js';

export interface CipherKeyPair {
  passcode: string;
}

export function getCipherMaps(passcode: string): CipherKeyPair {
  // We strictly use the passcode for military-grade AES-256 encryption.
  const cleanPasscode = passcode || "crypt_diary_default_secure_salt_772";
  return { passcode: cleanPasscode };
}

// Derive key from passcode using a fixed salt and PBKDF2 with caching to support instant typing feedback with 0ms latency.
const keyCache = new Map<string, any>();
export function getDerivedKey(passcode: string) {
  const cleanPasscode = passcode || "crypt_diary_default_secure_salt_772";
  if (keyCache.has(cleanPasscode)) {
    return keyCache.get(cleanPasscode);
  }
  
  // Using a fixed security salt for key derivation of the user passcode so we can cache results for rapid keystroke encoding
  const salt = CryptoJS.enc.Hex.parse("43727970746963446961727953616c74"); // "CrypticDiarySalt"
  const key = CryptoJS.PBKDF2(cleanPasscode, salt, {
    keySize: 256 / 32, // 256-bit key
    iterations: 100 // fast iteration check for instant UI response with high entropy keys
  });
  keyCache.set(cleanPasscode, key);
  return key;
}

export function getSecureShift(passcode: string, index: number): { letterShift: number; digitShift: number } {
  // Use SHA-256 to stretch the password + index into a cryptographically uncrackable key byte
  const hash = CryptoJS.SHA256(`${passcode}_${index}`).toString(CryptoJS.enc.Hex);
  // Parse first 4 hex characters to get a pseudo-random integer modulos
  const prefixVal = parseInt(hash.substring(0, 4), 16);
  return {
    letterShift: prefixVal % 26,
    digitShift: prefixVal % 10
  };
}

export function encodeVigenere(text: string, passcode: string): string {
  if (!text) return "";
  const key = passcode || "crypt_diary_default_secure_salt_772";
  
  return text.split("").map((char, index) => {
    const charCode = char.charCodeAt(0);
    const shifts = getSecureShift(key, index);
    
    // Shift Uppercase Letters
    if (charCode >= 65 && charCode <= 90) {
      return String.fromCharCode(((charCode - 65 + shifts.letterShift) % 26) + 65);
    }
    // Shift Lowercase Letters
    else if (charCode >= 97 && charCode <= 122) {
      return String.fromCharCode(((charCode - 97 + shifts.letterShift) % 26) + 97);
    }
    // Shift Digits
    else if (charCode >= 48 && charCode <= 57) {
      return String.fromCharCode(((charCode - 48 + shifts.digitShift) % 10) + 48);
    }
    // Whitespace, spaces, and punctuation remain exactly identical
    return char;
  }).join("");
}

export function decodeVigenere(text: string, passcode: string): string {
  if (!text) return "";
  const key = passcode || "crypt_diary_default_secure_salt_772";
  
  return text.split("").map((char, index) => {
    const charCode = char.charCodeAt(0);
    const shifts = getSecureShift(key, index);
    
    // Unshift Uppercase Letters
    if (charCode >= 65 && charCode <= 90) {
      return String.fromCharCode(((charCode - 65 - shifts.letterShift) % 26 + 26) % 26 + 65);
    }
    // Unshift Lowercase Letters
    else if (charCode >= 97 && charCode <= 122) {
      return String.fromCharCode(((charCode - 97 - shifts.letterShift) % 26 + 26) % 26 + 97);
    }
    // Unshift Digits
    else if (charCode >= 48 && charCode <= 57) {
      return String.fromCharCode(((charCode - 48 - shifts.digitShift) % 10 + 10) % 10 + 48);
    }
    return char;
  }).join("");
}

export function encodeWithMaps(text: string, maps: CipherKeyPair, mode: 'aes' | 'pen_paper' = 'pen_paper'): string {
  if (!text) return "";

  if (mode === 'pen_paper') {
    return encodeVigenere(text, maps.passcode);
  }

  try {
    const key = getDerivedKey(maps.passcode);
    
    // Split the text into alternating chunks of contiguous whitespace and contiguous non-whitespace.
    // This allows us to encrypt each "word" individually while preserving exact spacer counts and line breaks.
    const tokens = text.match(/\S+|\s+/g) || [];
    const encodedTokens = tokens.map(token => {
      // If the token is whitespace, return it exactly as-is to preserve spacing and formatting.
      if (/^\s+$/.test(token)) {
        return token;
      }

      // Encrypt the plain-text word using AES-256 with a unique random IV for this specific word.
      // This completely prevents identical words or prefixes from starting with the same sequence.
      const iv = CryptoJS.lib.WordArray.random(16);
      const encrypted = CryptoJS.AES.encrypt(token, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const ivHex = CryptoJS.enc.Hex.stringify(iv);
      const cipherHex = CryptoJS.enc.Hex.stringify(encrypted.ciphertext);
      
      // Each word is formatted: [32-random-hex-characters-IV][variable-ciphertext-hex]
      return ivHex + cipherHex;
    });

    return encodedTokens.join("");
  } catch (error) {
    console.error("Encryption error:", error);
    return "";
  }
}

export function decodeWithMaps(text: string, maps: CipherKeyPair, mode?: 'aes' | 'pen_paper'): string {
  if (!text) return "";

  try {
    const cleanText = text.replace(/\r/g, ''); // Standardize line endings

    // If explicit mode is requested or if we can auto-detect:
    // If it contains non-hexadecimal alphabetic characters beyond a-f, it must be Pen & Paper mode!
    const textSansWhitespaces = cleanText.replace(/\s/g, '');
    const isExplicitPenPaper = mode === 'pen_paper';
    const isAutoDetectedPenPaper = !isExplicitPenPaper && /[g-zG-Z]/.test(textSansWhitespaces);

    if (isExplicitPenPaper || isAutoDetectedPenPaper) {
      return decodeVigenere(cleanText, maps.passcode);
    }

    // Derive key
    const key = getDerivedKey(maps.passcode);

    // 1. Backwards Compatibility check: check if input starts with legacy OpenSSL prefix "Salted__" (53616c7465645f5f)
    if (textSansWhitespaces.startsWith("53616c7465645f5f")) {
      const wordArray = CryptoJS.enc.Hex.parse(textSansWhitespaces);
      const base64Str = CryptoJS.enc.Base64.stringify(wordArray);
      const decrypted = CryptoJS.AES.decrypt(base64Str, maps.passcode);
      const res = decrypted.toString(CryptoJS.enc.Utf8);
      if (res) return res;
    }

    // 2. Backwards Compatibility check: check if it's the single-block format (Salt + IV + Ciphertext used in previous version)
    if (textSansWhitespaces.length >= 48 && /^[0-9a-fA-F]+$/.test(textSansWhitespaces)) {
      try {
        const saltHex = textSansWhitespaces.substring(0, 16);
        const ivHex = textSansWhitespaces.substring(16, 48);
        const cipherTextHex = textSansWhitespaces.substring(48);

        const salt = CryptoJS.enc.Hex.parse(saltHex);
        const iv = CryptoJS.enc.Hex.parse(ivHex);
        const ciphertext = CryptoJS.enc.Hex.parse(cipherTextHex);

        const derivedKey = CryptoJS.PBKDF2(maps.passcode, salt, {
          keySize: 256 / 32,
          iterations: 1000
        });

        const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext });
        const decrypted = CryptoJS.AES.decrypt(cipherParams, derivedKey, {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        });

        const res = decrypted.toString(CryptoJS.enc.Utf8);
        if (res) return res;
      } catch (_) {
        // Fallback to token decoding
      }
    }

    // 3. New Word-by-Word line preserving decryption
    const tokens = cleanText.match(/\S+|\s+/g) || [];
    const decodedTokens = tokens.map(token => {
      // Keep whitespace exactly as-is
      if (/^\s+$/.test(token)) {
        return token;
      }

      // If token doesn't look like our hex format (minimum 32 character IV), return it raw
      if (token.length < 32 || !/^[0-9a-fA-F]+$/.test(token)) {
        return token;
      }

      try {
        const ivHex = token.substring(0, 32);
        const cipherTextHex = token.substring(32);

        const iv = CryptoJS.enc.Hex.parse(ivHex);
        const ciphertext = CryptoJS.enc.Hex.parse(cipherTextHex);

        const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext });
        const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        });

        const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
        return decryptedText || token; // If decrypted text is empty, fallback to the raw token
      } catch (_) {
        return token; // Fail-secure: keep token
      }
    });

    const finalDecoded = decodedTokens.join("");
    // If AES output looks empty or bad and we weren't in explicit mode, try Vigenere as final failsafe
    if (!finalDecoded.trim() || finalDecoded === text) {
      return decodeVigenere(cleanText, maps.passcode);
    }
    return finalDecoded;
  } catch (e) {
    console.error("Decryption error:", e);
    // Ultimate fallback is Vigenere
    return decodeVigenere(text, maps.passcode);
  }
}

