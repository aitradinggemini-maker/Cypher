/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

try {
  const wasmPath = path.resolve('node_modules/argon2-browser/dist/argon2.wasm');
  if (fs.existsSync(wasmPath)) {
    const loader = () => {
      const buf = fs.readFileSync(wasmPath);
      return Promise.resolve(new Uint8Array(buf));
    };
    (globalThis as any).loadArgon2WasmBinary = loader;
    if (typeof self !== 'undefined') (self as any).loadArgon2WasmBinary = loader;
    if (typeof window !== 'undefined') (window as any).loadArgon2WasmBinary = loader;
    if (typeof global !== 'undefined') (global as any).loadArgon2WasmBinary = loader;
    console.log('Synchronously registered loadArgon2WasmBinary in setup-test.');
  }
} catch (e: any) {
  console.error('Failed to register loadArgon2WasmBinary in setup-test:', e.message);
}
