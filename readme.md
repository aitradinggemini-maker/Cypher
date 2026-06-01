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
- **Dynamic HTML5 Canvas DOM Rendering Protocol**: To completely defeat aggressive password managers, clipboard loggers, translation overlays, and form-recovery Chrome extensions (which grab values via content script input value monitors and DOM string scrapers), the app implements an ultimate virtual typing sandbox:
  - Text input nodes are 100% replaced by rasterized HTML5 `<canvas>` objects.
  - On character input, the raw keystroke value is immediately extracted by React state, the hidden DOM element's actual value is instantly scrubbed to `""` in the same tick, and the mathematical output and english plaintext are drawn dynamically to an unreachable binary Canvas context frame.
  - Since the `<canvas>` buffer contains zero native HTML text structures or content properties, extensions and Chrome text-loggers literally read "blank/empty" DOMs and are physically disabled from recording, parsing, or extracting your saved caches or secret patches.
- **Initialization Vector (IV) Salting**: To defeat statistical frequency analysis and "known-plaintext" attacks where extensions or cache scrapers save pairs of previous texts, every manual encryption cycle prefixes a dynamic pseudorandom salt. The stream cipher matrix creates a unique encoded ciphertext path on every single conversion, preventing caching from breaking the deterministic algorithm.
- **Anti-Extension & Scraping Mitigation**: Password managers, translation tools, style checkers, and form-fillers intercept standard inputs. Cryptic Diary enforces:
  - `data-lpignore="true"` + `data-1p-ignore="true"` + `data-bwignore="true"` (Blocks password manager caching).
  - `data-gramm="false"` + `data-enable-grammarly="false"` (Defeats grammatical scraper engines).
  - `translate="no"` + `className="notranslate"` (Blocks Google and DeepL background translator tracers).
  - High-frequency dynamic alphanumeric IDs to thwart extension pattern recognition.

### 3. In-Memory Mathematical Execution
Every substitution uses a deterministic multi-map custom algorithm derived entirely from secure host seeds. The master key is held exclusively in volatile program memory (RAM) and destroyed upon visibility shifts (tab clicks, minimization, lock screen actions), idle timeouts, or manual shred actions.
