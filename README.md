# Cryptic Diary — Production-Grade Client-Side Ledger

An offline-first, client-only zero-knowledge cryptic ledger designed to be computationally infeasible to compromise—even under inspection by automated forensic tools or adversaries with file-system access.

All cryptography is compiled, derived, and verified exclusively inside the browser sandbox using the native **Web Crypto API** (for symmetric blocks) and **Argon2id (WASM-compiled)** (for key derivation). The Node server role is limited to loopback-bound static asset hosting, with zero involvement in key management, decryption, or storage indexes.

---

## 🔒 Threat Model Analysis

Every security claim must be modeled with honesty. Cryptic Diary makes no magic promises; it defines strict architectural boundaries.

| Category | Protects Against | Does NOT Protect Against |
| :--- | :--- | :--- |
| **Storage & Filesystem** | ✓ Offline database dumps (stored as opaque, passcode-bound, GCM-authenticated envelopes).<br>✓ Forensic inspections of cold browser disk spaces (session caching completely suppressed). | ✗ OS-level compromise (a malicious actor with active root/system control can dump active browser RAM segments). |
| **Key Derivation (KDF)** | ✓ Brute-force/dictionary attacks on weak passphrases (memory-hard, complex Argon2id iterations purposefully take ~1-2s). | ✗ Passphrases leaked/recorded prior to session entry (e.g., visual shoulder-surfing or physical camera feeds). |
| **Network & Injection** | ✓ MITM inspection or storage leakage (the loopback server handles zero secrets, served-once secure CSP prevents DOM injections). | ✗ Phishing sites or modified browser extension modules containing global keydown listeners. |
| **DOM & Browser Extensions** | ✓ Casually malicious background DOM scrapers (Keystroke Shield renders input canvas-side, returning zero DOM tokens). | ✗ Sophisticated kernel keyloggers or OS-level keystroke capture extensions listening below the DOM. |
| **Coercion (Plausible Deniability)** | ✓ Coercive passcode handovers (Decoy passcodes load a separate, benign secondary journal profile without leaking the other's existance). | ✗ Adversaries with theoretical quantum-advantage timeline decryption capability of pre-existing captures. |

---

## 🛠️ Cryptographic Architecture

### 1. Key Derivation Function (KDF)
- **Algorithm**: Argon2id (WASM-based)
- **Parameters**: 
  - Time/Iterations: `4`
  - Memory: `256 MiB` (`262,144 KiB`)
  - Parallelism/Threads: `2`
  - Output Key Length: `256 bits` (`32 bytes`)
  - Salt: Cryptographically secure 16-byte random salt (`crypto.getRandomValues`), regenerated on every save operation (no salt reuse).
- **UI Interaction**: Intentionally displays a custom "Computing High-Entropy Key..." spinner during derivation to demonstrate high computational hardness.

### 2. Symmetric Encryption
- **Algorithm**: AES-256-GCM (via `window.crypto.subtle`)
- **Initialization Vector (IV)**: 12-byte secure random values (`crypto.getRandomValues`), never reused.
- **Integrity Tag Length**: `128 bits` (default)
- **Authenticated Associated Data (AAD)**: The record's `Title` and `Version` byte are bound directly into the GCM AAD during encryption. Any modifications, cross-entry swap attacks, or ciphertext-malleability manipulation will fail authentication cleanly, failing closed with a custom error: `"Tampered or wrong passcode"`.

### 3. Binary Ciphertext Envelope (`.cyp` format)
The exported or stored backup structure is binary represented and Base64 mapped:
```
magic(4 chars) "CYP1" | version(1 byte) | salt(16 bytes) | iv(12 bytes) | ciphertext + tag (N bytes)
```
Visual characters are mapped bijectively to our OCR visual Glyphs dictionary (exemption of visually ambiguous, confusable, or padding characters like `I`, `l`, `O`, `0`, `1`, `=`).

### 4. Plausible Deniability Profile Mappings
When a passphrase is set:
1. It is digested using **one-way SHA-256** to derive a slot index: `cyp_db_[sha256(passcode).slice(0, 16)]`.
2. The ledger writes to that specific slot. If an alternate passcode (such as a Decoy) is entered, it writes to a distinct slot.
3. Since both slots are named using cryptographically random SHA-256 strings containing opaque GCM base64 blocks, there is no technical trace proving whether a second profile slot is a decoy, who owns it, or if it exists.

---

## 🚀 Running the Hardened Workspace

Ensure Node is active on your host system:

1. **Install Base Dependencies**:
   ```bash
   npm install
   ```
2. **Execute Offline Asset Cloning**:
   The build process automatically downloads and bundles the offline neural Core models for Tesseract.js so that no cloud networks are queried:
   ```bash
   npm run build
   ```
3. **Boot Loopback Loop Static Server**:
   ```bash
   npm run dev
   ```
   Access the application over loopback: `http://127.0.0.1:3000`.

---

## 📜 Contributing and Auditing
- **Zero Secrets on Host**: Server must never log or handle symmetric tokens. Keep `/api/*` endpoints static-only or information-only.
- **Never Roll Custom Ciphers**: Use standard SubtleCrypto wrappers.
- **Memory Purging**: Ensure `.destroy()` is called on all dynamic `Secret` class buffers to scrub memory traces.
