# Cryptic Diary

An offline-first, mathematically-secured zero-footprint cryptographic substitution engine. It operates 100% inside your sandboxed browser environment with strict memory scrubs, anti-telemetry protections, and extension defenses.

## 🛡️ Zero-Footprint Security Architecture

The application implements zero-footprint memory practices to guarantee that secret thoughts, raw images, and decoded glyphs leave absolutely no traces on Chrome's disk storage or inside browser caches.

### 1. Unified HTTP Cache & Storage Purging
The companion server (`server.ts`) injects industry-standard cryptographic headers for all static files, bundles, assets, and APIs:
- **`Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`**: Blocks any client or proxy-level page archiving.
- **`Clear-Site-Data: "cache", "cookies", "storage", "executionContexts"`**: Tells Chrome to completely purge all local storage, cookies, caches, and execution context histories upon initialization.

### 2. Sandbox Trash Collection & Memory Revocation
- **Image Blob Revocation**: Standard image upload and drop event listeners create temporary object URLs (`blob:` layouts). Unlike standard webapps that leak memory, Cryptic Diary performs proactive trash collection, calling `URL.revokeObjectURL` whenever an image is cleared, replaced, or shred.
- **Tesseract.js Core Sandbox Option**: The client-side OCR engine runs with `cacheMethod: "none"`. This prevents Tesseract.js from writing the downloaded neural network datasets to Chrome's IndexedDB disk space, loading raw parameters in transient web worker memory and destroying them upon termination.
- **Dynamic HTML5 Canvas DOM Rendering Protocol & Space Preservation**: To completely defeat aggressive password managers, clipboard loggers, translation overlays, and form-recovery Chrome extensions (which grab values via content script input value monitors and DOM string scrapers), the app implements an ultimate virtual typing sandbox. Spacebars, Enter, and Backspace keys are intercepted via low-level handlers to preserve word separation perfectly in all environments.
- **Randomized Cryptographic Salting & IV Generation**: To defeat statistical frequency analysis, known-plaintext, and duplicate sequence detection, every single keystroke triggers a newly generated random 8-byte Salt and a random 16-byte Initialization Vector (IV). A secure 256-bit AES key is derived via PBKDF2. This ensures that even encrypting identical words with the same token generates a completely unique encrypted hexadecimal series starting with 100% random characters every single time.
- **Masking & Stealth Visibility Toggle**: The Topic/Master Token supports standard hidden dot visibility (stealth password masking) with an instant tap toggle button to seamlessly transition rendering fields between secure hidden modes and visible reviews.
- **Anti-Extension & Scraping Mitigation**: Password managers, translation tools, style checkers, and form-fillers intercept standard inputs. Cryptic Diary enforces:
  - `data-lpignore="true"` + `data-1p-ignore="true"` + `data-bwignore="true"` (Blocks password manager caching).
  - `data-gramm="false"` + `data-enable-grammarly="false"` (Defeats grammatical scraper engines).
  - `translate="no"` + `className="notranslate"` (Blocks Google and DeepL background translator tracers).
  - High-frequency dynamic alphanumeric IDs to thwart extension pattern recognition.

### 3. In-Memory Mathematical Execution
Every substitution uses a deterministic multi-map custom algorithm derived entirely from secure host seeds. The master key is held exclusively in volatile program memory (RAM) and destroyed upon visibility shifts (tab clicks, minimization, lock screen actions), idle timeouts, or manual shred actions.
