# Secure Coding Contribution Guide

To preserve the cryptographic integrity and zero-knowledge posture of Cryptic Diary, all development work must adhere strictly to these hard rules.

## Hard Rules

### 1. Key Location and Transportation Role
- **No Keys on Server**: The server must never hold, generate, serialize, or transmit keys or passwords.
- **Dumb Static Host Role**: All cryptographic calculations (hashing, KDF, symmetric blocks, visual glyphed bijections) are bound to the client sandbox exclusively. The backend roles are strictly isolated to static loopback hosting.
- **Never Add Server-Side Endpoints**: Never add `/api/config-key` or similar hooks returning server authorization items.

### 2. Standard Cryptography
- **Never Roll Your Own Crypto**: Under no circumstances should custom stream ciphers, visual substitution tables, matrix maps, or autokey stream generators be introduced. All encryption relies exclusively on high-entropy standards (Argon2id and AES-256-GCM via Web Crypto Subtle API).
- **PRNG Rigor**: Never use non-cryptographic PRNGs (`Math.random`, `cyrb128`, or `mulberry32`) to generate seeds, salts, IVs, or authentication nonces. Use `crypto.getRandomValues` or `crypto.randomBytes` exclusively.

### 3. Memory Hygiene
- **Buffer Clears**: All raw decrypted or raw key bytecode arrays must be loaded inside the custom `Secret` class container, and `.destroy()` must be triggered directly after transaction boundaries to zero out memory buffers.
