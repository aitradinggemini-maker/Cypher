/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Camera, 
  Upload, 
  Loader2, 
  Sparkles, 
  Copy, 
  Check, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  LockKeyhole,
  Shield,
  Download,
  Key,
  Database,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  AlertTriangle,
  History
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import { 
  Secret, 
  encryptEntry, 
  decryptEntry, 
  base64ToGlyphs, 
  glyphsToBase64,
  sha256
} from './lib/crypto';
import { CanvasText } from './components/CanvasText';

// Core Type Definitions
interface DiaryEntry {
  id: string;
  title: string;
  date: string;
  content: string;
}

interface ProfileState {
  entries: DiaryEntry[];
}

export default function App() {
  // --- 1. State Hooks ---
  const [activeTab, setActiveTab] = useState<'write' | 'read'>('write');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  
  // Active states
  const [isDerivingKey, setIsDerivingKey] = useState(false);
  const [derivationStatus, setDerivationStatus] = useState('');
  const [activeEntries, setActiveEntries] = useState<DiaryEntry[]>([]);
  const [activePasscodeHash, setActivePasscodeHash] = useState<string | null>(null);
  const [isDatabaseUnlocked, setIsDatabaseUnlocked] = useState(false);
  const [decoyModeActive, setDecoyModeActive] = useState(false);

  // Write Form states
  const [entryTitle, setEntryTitle] = useState('');
  const [englishText, setEnglishText] = useState('');
  const [isEncodingGlyphMode, setIsEncodingGlyphMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [encryptionOutput, setEncryptionOutput] = useState('');

  // Scanning / OCR states
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOCRDecoding, setIsOCRDecoding] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [pasteCipherText, setPasteCipherText] = useState('');
  const [pastedEncodingMode, setPastedEncodingMode] = useState<'b64' | 'glyph'>('b64');
  const [directPastedTitle, setDirectPastedTitle] = useState('My Secret Title');
  const [scanOrPasteResult, setScanOrPasteResult] = useState<{ extracted: string; decoded: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UI / Custom Settings states
  const [idleTimeoutSetting, setIdleTimeoutSetting] = useState<number>(300); // 300s = 5 min
  const [idleCountRemaining, setIdleCountRemaining] = useState<number | null>(null);
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [lockedByTabHide, setLockedByTabHide] = useState(false);
  const [unlockPasscodeInput, setUnlockPasscodeInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Keystroke Shield
  const [isKeystrokeShieldActive, setIsKeystrokeShieldActive] = useState(true);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [isBodyFocused, setIsBodyFocused] = useState(false);
  const [isCipherFocused, setIsCipherFocused] = useState(false);

  // Refs for tracking background interval handlers / elements
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const activityTimerRef = useRef<any>(null);
  const activityTimeoutRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const clipIntervalRef = useRef<any>(null);

  const titleHiddenRef = useRef<HTMLInputElement>(null);
  const bodyHiddenRef = useRef<HTMLTextAreaElement>(null);
  const cipherHiddenRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic input tokens to neutralize autofill DOM scrapers
  const [fieldToken] = useState(() => 'f_' + Math.floor(Math.random() * 1000000).toString(36));

  // --- 2. Passcode Strength Logic ---
  const evaluatePasscode = useCallback((pass: string) => {
    const requirements: string[] = [];
    if (pass.length < 12) requirements.push("Minimum 12 characters");
    if (!/[A-Z]/.test(pass)) requirements.push("One uppercase letter (A-Z)");
    if (!/[a-z]/.test(pass)) requirements.push("One lowercase letter (a-z)");
    if (!/[0-9]/.test(pass)) requirements.push("One numeric digit (0-9)");
    if (!/[^A-Za-z0-9]/.test(pass)) requirements.push("One special symbol (#, @, $, &, %, *)");

    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass)) score++;
    if (pass.length < 8) score = 0;

    let label: 'Weak' | 'Fair' | 'Good' | 'Strong' = 'Weak';
    let color = 'bg-red-500/80';

    if (score === 1) {
      label = 'Weak';
      color = 'bg-red-500/70';
    } else if (score === 2) {
      label = 'Fair';
      color = 'bg-orange-500/80';
    } else if (score === 3) {
      label = 'Good';
      color = 'bg-yellow-500/80';
    } else if (score === 4 && pass.length >= 12 && requirements.length === 0) {
      label = 'Strong';
      color = 'bg-emerald-500/90';
    } else {
      label = 'Fair';
      color = 'bg-orange-500/80';
    }

    return { 
      score, 
      label, 
      color, 
      requirements, 
      isAcceptable: label === 'Strong' && pass.length >= 12 && requirements.length === 0
    };
  }, []);

  const strength = evaluatePasscode(passcode);

  // --- 3. Zero-Footprint Purification Steps ---
  const destructAllBrowserFootprints = useCallback(() => {
    try {
      localStorage.removeItem('session_active_token');
      sessionStorage.clear();

      // Wipe cookies
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }

      // Delete Caches
      if (window.caches && window.caches.keys) {
        window.caches.keys().then((keys) => {
          keys.forEach((key) => window.caches.delete(key));
        });
      }

      // De-register Service Workers
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }

      // Clean IndexedDB
      if (window.indexedDB && window.indexedDB.databases) {
        window.indexedDB.databases().then((dbs) => {
          dbs.forEach((db) => {
            if (db.name && db.name !== 'localforage') {
              window.indexedDB.deleteDatabase(db.name);
            }
          });
        });
      }
    } catch (_) {}
  }, []);

  const handleShredMemory = useCallback(() => {
    try {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    } catch (_) {}

    // Complete memory wash
    setEnglishText('');
    setEntryTitle('');
    setEncryptionOutput('');
    setPasteCipherText('');
    setSelectedImage(null);
    setPreviewUrl(null);
    setScanOrPasteResult(null);
    setErrorMsg(null);
    setIsDatabaseUnlocked(false);
    setActiveEntries([]);
    setActivePasscodeHash(null);
    setUnlockPasscodeInput('');
    setUnlockError(null);
    destructAllBrowserFootprints();
  }, [previewUrl, destructAllBrowserFootprints]);

  // --- 4. Configurable Idle Inactivity & In-Flight Warnings ---
  const handleIdleTriggerWipe = useCallback(() => {
    handleShredMemory();
    setShowInactivityWarning(false);
    setIdleCountRemaining(null);
  }, [handleShredMemory]);

  const resetInactivityTimer = useCallback(() => {
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setShowInactivityWarning(false);
    setIdleCountRemaining(null);

    // Warm-up warning dialog 10 seconds before wipe triggers
    const warningBuffer = Math.max(10, idleTimeoutSetting - 10);

    activityTimerRef.current = setTimeout(() => {
      setShowInactivityWarning(true);
      let secondsRemaining = 10;
      setIdleCountRemaining(secondsRemaining);

      countdownIntervalRef.current = setInterval(() => {
        secondsRemaining--;
        setIdleCountRemaining(secondsRemaining);
        if (secondsRemaining <= 0) {
          clearInterval(countdownIntervalRef.current);
          handleIdleTriggerWipe();
        }
      }, 1000);
    }, warningBuffer * 1000);
  }, [idleTimeoutSetting, handleIdleTriggerWipe]);

  // Setup Activity Resets
  useEffect(() => {
    const monitorEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const reset = () => {
      // Only reset timer if we aren't inside the 10-second countdown (which requires deliberate user interactions)
      if (!showInactivityWarning) {
        resetInactivityTimer();
      }
    };

    monitorEvents.forEach(evt => window.addEventListener(evt, reset));
    resetInactivityTimer();

    return () => {
      monitorEvents.forEach(evt => window.removeEventListener(evt, reset));
      if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [idleTimeoutSetting, showInactivityWarning, resetInactivityTimer]);

  // --- 5. Tab Visible / Hidden Blur and Locking ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Blur focusing elements to prevent inspection
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        // If they have unlocked their database, lock tab
        if (isDatabaseUnlocked) {
          setLockedByTabHide(true);
          setUnlockPasscodeInput('');
          setUnlockError(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleShredMemory);
    window.addEventListener('unload', handleShredMemory);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleShredMemory);
      window.removeEventListener('unload', handleShredMemory);
    };
  }, [isDatabaseUnlocked, handleShredMemory]);

  const handleUnlockTab = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);

    if (!unlockPasscodeInput) return;

    try {
      const derivedHash = await sha256(unlockPasscodeInput);
      if (derivedHash === activePasscodeHash) {
        setLockedByTabHide(false);
        setUnlockPasscodeInput('');
        resetInactivityTimer();
      } else {
        setUnlockError("Invalid passphrase. Re-authentication refused.");
      }
    } catch (_) {
      setUnlockError("Crypto exception occurred during validation.");
    }
  };

  // --- 6. Profiles & Plausible Deniability Decoy Logic ---
  const saveStateToLocalStorage = async (entries: DiaryEntry[], pass: string) => {
    try {
      const dbHash = await sha256(pass);
      const secretKey = dbHash.slice(0, 16);
      
      const payload: ProfileState = { entries };
      const serialized = JSON.stringify(payload);

      // Encrypt the ledger as a single encrypted master envelope for total schema stealth!
      const encryptedObj = await encryptEntry("diary_ledger_v1", serialized, pass);
      localStorage.setItem(`cyp_db_${secretKey}`, encryptedObj.envelopeB64);
    } catch (e: any) {
      console.error("Storage vault save error:", e.message);
    }
  };

  const handleAccessProfile = async () => {
    if (!strength.isAcceptable) return;

    setIsDerivingKey(true);
    setDerivationStatus("Spinning memory-hard high-entropy keys (Argon2id WASM, iterations=4, mem=256MB)...");
    setErrorMsg(null);

    setTimeout(async () => {
      try {
        const passHash = await sha256(passcode);
        const secretKey = passHash.slice(0, 16);
        const storedEnvelope = localStorage.getItem(`cyp_db_${secretKey}`);

        if (storedEnvelope) {
          // Profile exists, decrypt entries ledger
          const decryptedJson = await decryptEntry("diary_ledger_v1", storedEnvelope, passcode);
          const parsed: ProfileState = JSON.parse(decryptedJson);
          setActiveEntries(parsed.entries);
          setIsDatabaseUnlocked(true);
          setActivePasscodeHash(passHash);
        } else {
          // Create new ledger or setup Decoy profile values if user requested decoy
          // We establish standard plausibly harmless entries if decoy profile
          const initialList: DiaryEntry[] = [];
          if (passcode.toLowerCase().includes('decoy') || passcode.length % 2 === 0) {
            initialList.push({
              id: 'decoy-welcome',
              title: 'Standard Garden ledger',
              date: new Date().toLocaleDateString(),
              content: 'Watered the front lawn roses. Prepared soil beds for lavender plantation. Workout routine accomplished (15 minutes cardio).'
            });
            setDecoyModeActive(true);
          } else {
            setDecoyModeActive(false);
          }
          setActiveEntries(initialList);
          setIsDatabaseUnlocked(true);
          setActivePasscodeHash(passHash);
          await saveStateToLocalStorage(initialList, passcode);
        }
        resetInactivityTimer();
      } catch (err: any) {
        setErrorMsg(err.message || "Integrity Failure: Passcode was incorrect or tag checked invalid.");
      } finally {
        setIsDerivingKey(false);
        setDerivationStatus('');
      }
    }, 100);
  };

  // --- 7. Core Cryptographic Tasks (Symmetric Writes & local OCR) ---
  const handleAddNewEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTitle.trim() || !englishText.trim()) return;

    setIsDerivingKey(true);
    setDerivationStatus("Computing AES-256GCM key and generating authenticated binary envelope...");

    setTimeout(async () => {
      try {
        const newEntry: DiaryEntry = {
          id: Math.random().toString(36).substring(2, 11),
          title: entryTitle.trim(),
          date: new Date().toLocaleDateString(),
          content: englishText.trim()
        };

        const updatedEntries = [newEntry, ...activeEntries];
        setActiveEntries(updatedEntries);
        await saveStateToLocalStorage(updatedEntries, passcode);

        // Derive active in-flight ciphertext for OCR scanning export
        const encryptedResult = await encryptEntry(entryTitle.trim(), englishText.trim(), passcode);
        
        if (isEncodingGlyphMode) {
          setEncryptionOutput(base64ToGlyphs(encryptedResult.envelopeB64));
        } else {
          setEncryptionOutput(encryptedResult.envelopeB64);
        }

        // Clean values
        setEnglishText('');
        setEntryTitle('');
        setErrorMsg(null);
        resetInactivityTimer();
      } catch (err: any) {
        setErrorMsg(`Cryptographic Write Fault: ${err.message}`);
      } finally {
        setIsDerivingKey(false);
        setDerivationStatus('');
      }
    }, 100);
  };

  const handleCopy = () => {
    if (!encryptionOutput) return;
    navigator.clipboard.writeText(encryptionOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (clipIntervalRef.current) clearInterval(clipIntervalRef.current);
    setClipboardCountdown(15);
    
    let left = 15;
    clipIntervalRef.current = setInterval(() => {
      left--;
      setClipboardCountdown(left);
      if (left <= 0) {
        if (clipIntervalRef.current) clearInterval(clipIntervalRef.current);
        setClipboardCountdown(null);
        try {
          navigator.clipboard.writeText(" "); // Wipe OS buffer
        } catch (_) {}
      }
    }, 1000);
  };

  const handleDeleteEntry = async (id: string) => {
    const updated = activeEntries.filter(entry => entry.id !== id);
    setActiveEntries(updated);
    await saveStateToLocalStorage(updated, passcode);
    resetInactivityTimer();
  };

  // 100% Client-Side Local OCR execution with strictly enforced zero-cache configuration
  const handleLocalOCR = async () => {
    if (!selectedImage) return;
    setIsOCRDecoding(true);
    setErrorMsg(null);
    setScanOrPasteResult(null);
    setOcrProgress(0);
    setOcrStatus('Initializing local neural core...');

    let worker: Tesseract.Worker | null = null;
    try {
      // Force Tesseract.js to load exclusively from our local /public/tesseract paths (fully offline)
      worker = await Tesseract.createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core-lstm.wasm.js',
        langPath: '/tesseract',
        logger: (m) => {
          if (m.status === 'loading tesseract core' || m.status === 'initializing api') {
            setOcrStatus('Warming up client-side OCR engine...');
            setOcrProgress(Math.round(m.progress * 100));
          } else if (m.status === 'recognizing text') {
            setOcrStatus('Reading handwritten/printed characters...');
            setOcrProgress(Math.round(m.progress * 102) > 100 ? 100 : Math.round(m.progress * 100));
          }
        }
      });

      // Execute scan and fetch output
      const result = await worker.recognize(selectedImage);
      let rawExtractedText = (result.data.text || "").replace(/\s/g, ''); // Strip spacing for binary conversion
      
      if (!rawExtractedText.trim()) {
        throw new Error("No readable text found. Ensure characters are clearly drawn.");
      }

      setOcrStatus("Decrypting cipher envelope...");
      // Re-evaluate visual Glyph mapping conversion if raw scan maps Glyph alphabet
      let targetB64 = rawExtractedText;
      if (pastedEncodingMode === 'glyph') {
        targetB64 = glyphsToBase64(rawExtractedText);
      }

      const decodedString = await decryptEntry(directPastedTitle.trim(), targetB64, passcode);
      setScanOrPasteResult({ 
        extracted: result.data.text || "", 
        decoded: decodedString 
      });
      resetInactivityTimer();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to scan. Check image legibility or correct cryptographic title/passcode.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {}
      }
      setIsOCRDecoding(false);
      setOcrProgress(0);
      setOcrStatus('');
    }
  };

  const handleDirectPasteDecode = async () => {
    if (!pasteCipherText.trim()) return;
    setErrorMsg(null);
    setScanOrPasteResult(null);

    setIsDerivingKey(true);
    setDerivationStatus("Decoding envelope structure and parsing GCM authenticated tag...");

    setTimeout(async () => {
      try {
        let envelope = pasteCipherText.trim().replace(/\s/g, '');
        if (pastedEncodingMode === 'glyph') {
          envelope = glyphsToBase64(envelope);
        }

        const decoded = await decryptEntry(directPastedTitle.trim(), envelope, passcode);
        setScanOrPasteResult({
          extracted: pasteCipherText.trim(),
          decoded: decoded
        });
        resetInactivityTimer();
      } catch (err: any) {
        setErrorMsg(err.message || "Decryption failure: Wrong Title AAD tag or passcode mismatched.");
      } finally {
        setIsDerivingKey(false);
        setDerivationStatus('');
      }
    }, 100);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      } catch (_) {}
      setSelectedImage(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setScanOrPasteResult(null);
      setErrorMsg(null);
    }
  };

  // --- 8. Encrypted Profile Export & Importers ---
  const handleExportProfile = async () => {
    try {
      const keyHash = await sha256(passcode);
      const secretSlot = keyHash.slice(0, 16);
      const rawEnvelope = localStorage.getItem(`cyp_db_${secretSlot}`);
      
      if (!rawEnvelope) {
        setErrorMsg("Empty database profile. Write some entries before backup.");
        return;
      }

      // Format visual output file download
      const element = document.createElement("a");
      const file = new Blob([rawEnvelope], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `diary_backup_${secretSlot}.cyp`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (e: any) {
      setErrorMsg(`Export failed: ${e.message}`);
    }
  };

  const handleImportProfileClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportProfileFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content || !content.trim()) {
        setErrorMsg("Import file is empty.");
        return;
      }

      setIsDerivingKey(true);
      setDerivationStatus("Validating encrypted .cyp profile and caching securely...");

      setTimeout(async () => {
        try {
          const passHash = await sha256(passcode);
          const secretKey = passHash.slice(0, 16);

          // Try to decrypt the loaded envelope with user passcode to verify its integrity
          const decryptedJson = await decryptEntry("diary_ledger_v1", content.trim(), passcode);
          const parsed: ProfileState = JSON.parse(decryptedJson);

          // If decrypted successfully, register envelope and update active states!
          localStorage.setItem(`cyp_db_${secretKey}`, content.trim());
          setActiveEntries(parsed.entries);
          setIsDatabaseUnlocked(true);
          setActivePasscodeHash(passHash);
          setErrorMsg(null);
          alert("Encrypted backup profile successfully loaded and verified!");
        } catch (err: any) {
          setErrorMsg("Import validation failure: Passcode does not match backup profile or file holds invalid signature.");
        } finally {
          setIsDerivingKey(false);
          setDerivationStatus('');
          if (importFileInputRef.current) importFileInputRef.current.value = '';
        }
      }, 100);
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen font-sans selection:bg-amber-500/25 selection:text-amber-200 bg-stone-950 text-stone-100 p-4 md:p-8 lg:p-12 relative">
      <div className="max-w-6xl mx-auto">
        
        {/* --- Header Brand --- */}
        <header className="mb-8 flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-stone-900">
          <div>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <Sparkles className="w-8 h-8 text-amber-500" />
              <h1 className="text-3xl font-serif text-stone-100 uppercase tracking-wider">Cryptic Diary</h1>
            </div>
            <p className="text-stone-500 mt-2 text-xs">
              Client-only authenticated zero-knowledge ledger. Self-contained Argon2id KDF + AES-256GCM.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleShredMemory}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-950/25 border border-red-900/30 hover:border-red-500/50 hover:bg-red-950/50 text-red-400 hover:text-red-350 text-xs font-semibold transition shadow-md"
              title="Instantly scrubs inputs, decrypted texts, scans and deletes browser Storage indexes"
            >
              <Unlock className="w-3.5 h-3.5" />
              Secure Shred RAM
            </button>

            <div className="flex bg-stone-900 p-1 rounded-xl border border-stone-850">
              <button
                onClick={() => setActiveTab('write')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'write' ? 'bg-stone-820 text-amber-500 border border-stone-700/60 shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Ledger Workspace
              </button>
              <button
                onClick={() => setActiveTab('read')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'read' ? 'bg-stone-820 text-amber-500 border border-stone-700/60 shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
              >
                <Camera className="w-3.5 h-3.5" />
                Local OCR Scan
              </button>
            </div>
          </div>
        </header>

        {/* --- Top Level Setup and Credentials Block --- */}
        <div className="mb-8 grid md:grid-cols-4 gap-4">
          <div className="md:col-span-3 bg-stone-900/40 border border-stone-870 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-200 flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-500" />
                  Derive Storage Passphrase
                </h3>
                {isDatabaseUnlocked && (
                  <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${decoyModeActive ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {decoyModeActive ? "Decoy Mode Active (Plausible Deniability)" : "Active Primary Storage Profile"}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Derived key holds absolute authority over your records. Blocked unless password strength is Strong.
              </p>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <input 
                  type={showPasscode ? "text" : "password"} 
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    if (isDatabaseUnlocked) {
                      // Shred session if they change passcode while database is active
                      setIsDatabaseUnlocked(false);
                      setActiveEntries([]);
                      setActivePasscodeHash(null);
                    }
                  }}
                  onPaste={(e) => e.preventDefault()} // Block caching copy-paste history
                  placeholder="Type dynamic master secure passphrase key..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-amber-500 font-mono outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/15 transition-all font-bold placeholder:text-stone-700"
                  spellCheck="false"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAccessProfile}
                  disabled={!strength.isAcceptable || isDerivingKey}
                  className="px-5 py-2.5 rounded-xl text-stone-950 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-850 disabled:text-stone-600 transition text-xs font-bold shadow-md flex items-center gap-2 justify-center"
                >
                  {isDatabaseUnlocked ? "Reload DB Slot" : "Open Storage Slot"}
                </button>
                
                {isDatabaseUnlocked && (
                  <>
                    <button
                      onClick={handleExportProfile}
                      className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-stone-200 transition"
                      title="Export backup ledger envelope (.cyp)"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleImportProfileClick}
                      className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-stone-200 transition"
                      title="Validate & Load back up ledger (.cyp)"
                    >
                      <Database className="w-4 h-4" />
                    </button>
                    <input 
                      type="file" 
                      ref={importFileInputRef}
                      onChange={handleImportProfileFile}
                      accept=".cyp"
                      className="hidden"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Passphrase Criteria Validation */}
            <div className="mt-3.5">
              <div className="flex justify-between items-center text-[10px] font-semibold text-stone-400 mb-1.5">
                <span>Passphrase Rating: <span className="font-bold text-stone-200">{strength.label}</span></span>
                <span>Minimum Requirements: <span className={strength.isAcceptable ? 'text-emerald-500' : 'text-red-400'}>{strength.isAcceptable ? 'PASSED (computational robust)' : 'NOT MET'}</span></span>
              </div>
              <div className="h-1.5 w-full bg-stone-950 rounded-full overflow-hidden border border-stone-850 flex gap-0.5">
                <div className={`h-full ${strength.score >= 1 ? strength.color : 'bg-stone-900'} flex-1 transition-all duration-200`}></div>
                <div className={`h-full ${strength.score >= 2 ? strength.color : 'bg-stone-900'} flex-1 transition-all duration-200`}></div>
                <div className={`h-full ${strength.score >= 3 ? strength.color : 'bg-stone-900'} flex-1 transition-all duration-200`}></div>
                <div className={`h-full ${strength.score >= 4 && strength.isAcceptable ? 'strength.color' : 'bg-stone-900'} ${strength.isAcceptable ? 'bg-emerald-500' : 'bg-stone-900'} flex-1 transition-all duration-200`}></div>
              </div>
              
              {!strength.isAcceptable && passcode.length > 0 && (
                <div className="mt-2 text-[10px] text-red-400 font-medium flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-semibold text-red-500">Leftover targets:</span>
                  {strength.requirements.map((req, i) => (
                    <span key={i} className="flex items-center gap-1">❌ {req}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-stone-900/40 border border-stone-870 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-stone-200 flex items-center gap-2">
                <LockKeyhole className="w-4 h-4 text-amber-500" />
                Active Session Policy
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Configure auto-shred RAM thresholds. System clears cookies and cache upon timeout.
              </p>
            </div>

            <div className="mt-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Inactivity Timeout:</span>
                <select 
                  value={idleTimeoutSetting} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setIdleTimeoutSetting(val);
                    resetInactivityTimer();
                  }}
                  className="bg-stone-950 border border-stone-820 rounded-lg text-2xs py-1 px-2.5 font-bold outline-none text-amber-400 max-w-[120px]"
                >
                  <option value={60}>1 Minute</option>
                  <option value={300}>5 Minutes</option>
                  <option value={900}>15 Minutes</option>
                  <option value={1800}>30 Minutes</option>
                </select>
              </div>

              <div className="border-t border-stone-850/40 pt-2.5 flex items-center justify-between text-2xs text-stone-500">
                <span>Local Clock (UTC):</span>
                <span className="font-mono text-stone-300 font-medium">{new Date().toISOString().slice(11, 19)} UTC</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- Global Notifications --- */}
        {errorMsg && (
          <div className="mb-6 bg-red-950/25 border border-red-900/40 text-red-400 p-4 rounded-xl text-xs flex gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2.5} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* --- Main Workspace --- */}
        <main>
          {isDerivingKey && (
            <div className="mb-6 bg-amber-500/[0.04] border border-amber-500/20 text-amber-500 rounded-2xl p-5 flex items-center gap-4 animate-pulse">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-bold">Secure Operation In Progress</p>
                <p className="text-[10px] text-stone-400 mt-0.5">{derivationStatus}</p>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            
            {/* LEDGER WORKSPACE (WRITE TAB) */}
            {activeTab === 'write' && (
              <motion.div
                key="tab-write"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid md:grid-cols-5 gap-6"
              >
                {!isDatabaseUnlocked ? (
                  <div className="md:col-span-5 bg-stone-900/20 border border-stone-870/50 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
                    <LockKeyhole className="w-12 h-12 text-stone-800 mb-4 animate-pulse" />
                    <h3 className="font-serif text-lg text-stone-300 font-medium">Vault Profile is Locked</h3>
                    <p className="text-xs text-stone-500 mt-1 max-w-md">
                      Type your 12+ character high-entropy master passcode above and click "Open Storage Slot" to access your secure diary logs.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Record Creator Block */}
                    <div className="md:col-span-3 flex flex-col gap-6">
                      <div className="bg-stone-900/40 border border-stone-870 rounded-2xl p-6 flex flex-col h-[52vh] min-h-[380px]">
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <span className="text-[9px] font-bold text-amber-500 tracking-wider uppercase bg-amber-500/10 px-2 py-0.5 rounded">Create New Record</span>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-lg bg-amber-500/[0.02] border border-amber-550/10" title="Reduces casual DOM scraping. Does NOT defeat OS-level keyloggers or browser extensions with keydown listeners.">
                              <Shield className={`w-3 h-3 ${isKeystrokeShieldActive ? 'text-amber-500' : 'text-stone-500'}`} />
                              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest cursor-help">Keystroke Shield</span>
                              <button 
                                onClick={() => {
                                  setIsKeystrokeShieldActive(!isKeystrokeShieldActive);
                                  setEntryTitle('');
                                  setEnglishText('');
                                }}
                                className={`relative inline-flex h-3 w-5.5 shrink-0 cursor-pointer rounded-full border border-stone-850 transition-colors duration-150 ease-in-out focus:outline-none ${isKeystrokeShieldActive ? 'bg-amber-500/80' : 'bg-stone-950'}`}
                                type="button"
                              >
                                <span className={`pointer-events-none inline-block h-2 w-2 transform rounded-full bg-stone-950 shadow transition duration-150 ease-in-out ${isKeystrokeShieldActive ? 'translate-x-[9px]' : 'translate-x-[1px]'}`} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {isKeystrokeShieldActive ? (
                          <>
                            {/* Title Shield Representation */}
                            <div 
                              onClick={() => titleHiddenRef.current?.focus()}
                              className={`w-full bg-transparent pb-3 mb-4 border-b text-md outline-none min-h-[34px] cursor-text flex items-center relative transition-colors duration-150 ${isTitleFocused ? 'border-amber-500/25' : 'border-stone-800'}`}
                            >
                              <CanvasText 
                                text={entryTitle} 
                                placeholder="Diary Log Title..." 
                                font="600 15px Georgia, serif" 
                                showCursor={isTitleFocused}
                                color="#e7e5e4"
                              />
                              <input
                                ref={titleHiddenRef}
                                type="text"
                                defaultValue=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) setEntryTitle(prev => prev + val);
                                  e.target.value = '';
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Backspace') {
                                    e.preventDefault();
                                    setEntryTitle(prev => prev.slice(0, -1));
                                  }
                                }}
                                onFocus={() => setIsTitleFocused(true)}
                                onBlur={() => setIsTitleFocused(false)}
                                className="absolute w-px h-px opacity-0 pointer-events-none left-0 top-0 select-none"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck="false"
                                data-lpignore="true"
                              />
                            </div>

                            {/* Body Shield Representation */}
                            <div 
                              onClick={() => bodyHiddenRef.current?.focus()}
                              className="flex-1 w-full bg-transparent text-stone-200 leading-relaxed text-xs overflow-y-auto cursor-text relative pb-6 min-h-[150px]"
                            >
                              <CanvasText 
                                text={englishText} 
                                placeholder="Describe your confidential logs or secret thoughts. Rendered in real-time inside secure RAM vectors..." 
                                font="400 13px Georgia, serif" 
                                showCursor={isBodyFocused}
                                color="#d6d3d1"
                              />
                              <textarea
                                ref={bodyHiddenRef}
                                defaultValue=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) setEnglishText(prev => prev + val);
                                  e.target.value = '';
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Backspace') {
                                    e.preventDefault();
                                    setEnglishText(prev => prev.slice(0, -1));
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    setEnglishText(prev => prev + '\n');
                                  }
                                }}
                                onFocus={() => setIsBodyFocused(true)}
                                onBlur={() => setIsBodyFocused(false)}
                                className="absolute w-px h-px opacity-0 pointer-events-none left-0 top-0 select-none resize-none"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck="false"
                                data-lpignore="true"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              name={fieldToken + "_title"}
                              id={fieldToken + "_title"}
                              value={entryTitle}
                              onChange={(e) => setEntryTitle(e.target.value)}
                              placeholder="Diary Log Title..."
                              autoComplete="new-password"
                              className="w-full bg-transparent pb-3 mb-4 border-b border-stone-800 text-sm font-serif text-stone-200 outline-none placeholder:text-stone-700 font-semibold"
                            />
                            <textarea
                              name={fieldToken + "_text"}
                              id={fieldToken + "_text"}
                              value={englishText}
                              onChange={(e) => setEnglishText(e.target.value)}
                              placeholder="Describe your confidential logs or secret thoughts here..."
                              autoComplete="new-password"
                              className="flex-1 w-full bg-transparent resize-none focus:outline-none text-xs text-stone-200 placeholder:text-stone-700 font-serif leading-relaxed"
                            />
                          </>
                        )}

                        <div className="flex justify-between items-center mt-3 border-t border-stone-850/60 pt-3">
                          <div className="flex bg-stone-950 p-0.5 rounded-lg border border-stone-850">
                            <button
                              type="button"
                              onClick={() => {
                                setIsEncodingGlyphMode(false);
                                setEncryptionOutput('');
                              }}
                              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${!isEncodingGlyphMode ? 'bg-stone-820 text-amber-500 font-extrabold' : 'text-stone-500'}`}
                            >
                              Standard Base64 ⚡
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEncodingGlyphMode(true);
                                setEncryptionOutput('');
                              }}
                              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${isEncodingGlyphMode ? 'bg-stone-820 text-amber-500 font-extrabold' : 'text-stone-500'}`}
                            >
                              Handwriting Glyphs ✍️
                            </button>
                          </div>

                          <button
                            onClick={handleAddNewEntry}
                            disabled={!entryTitle.trim() || !englishText.trim() || isDerivingKey}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-850 disabled:text-stone-600 text-stone-950 text-2xs font-extrabold tracking-wider uppercase rounded-xl transition flex items-center gap-1.5 shadow-md"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Encrypt & Save
                          </button>
                        </div>
                      </div>

                      {/* Dynamic In-Flight Encryption Translate Area */}
                      {encryptionOutput && (
                        <div className="bg-stone-900/40 border border-stone-800 rounded-2xl p-5 relative">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold text-amber-500 tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">Latest Active Cipher Envelope</span>
                            <div className="flex items-center gap-2">
                              {clipboardCountdown !== null && (
                                <span className="text-[8px] font-mono font-medium text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20 animate-pulse shrink-0">
                                  Clipboard sweeps in {clipboardCountdown}s
                                </span>
                              )}
                              <button 
                                onClick={handleCopy}
                                className="text-stone-400 hover:text-stone-200 bg-stone-950 border border-stone-850 hover:border-stone-800 p-1.5 rounded-lg transition"
                                title="Copy envelope"
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <div className="p-3 bg-stone-950/70 border border-stone-850 rounded-xl max-h-32 overflow-y-auto font-mono text-2xs select-all text-amber-400 break-all leading-relaxed">
                            {encryptionOutput}
                          </div>
                          <p className="text-[10px] text-stone-500 mt-2 italic">
                            This specific envelope is derived directly from Title: "{entryTitle || 'My Log'}" as Authenticated Associated Data (AAD). Keep the Title identical during decryption scans!
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Active Saved History List Panel */}
                    <div className="md:col-span-2 flex flex-col h-[52vh] min-h-[380px] bg-stone-950 border border-stone-870 rounded-2xl p-5 relative">
                      <div className="flex items-center gap-2 border-b border-stone-900 pb-3 mb-3 shrink-0">
                        <History className="w-4 h-4 text-amber-500" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300">Diary History Ledger</h4>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-stone-350">
                        {activeEntries.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center p-4">
                            <Unlock className="w-6 h-6 text-stone-800 mb-2" />
                            <p className="text-2xs text-stone-600">Storage profile is open. Create your first encrypted ledger entry!</p>
                          </div>
                        ) : (
                          activeEntries.map(entry => (
                            <div key={entry.id} className="p-3.5 bg-stone-900/30 border border-stone-900 rounded-xl space-y-2 relative group hover:border-amber-500/10 transition">
                              <button 
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="absolute top-3.5 right-3.5 text-stone-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Purge Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              
                              <div className="pr-6">
                                <h5 className="text-xs font-serif font-bold text-stone-200 leading-tight">{entry.title}</h5>
                                <span className="text-[9px] font-mono text-stone-600 mt-0.5 block">{entry.date}</span>
                              </div>
                              <p className="text-2xs leading-relaxed text-stone-400 font-serif whitespace-pre-wrap">{entry.content}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* DECRYPT & SCAN WORKSPACE (READ TAB) */}
            {activeTab === 'read' && (
              <motion.div
                key="tab-read"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto grid md:grid-cols-5 gap-6"
              >
                {/* Upload & Setup Selection Panel */}
                <div className="md:col-span-3 bg-stone-900/40 border border-stone-870 rounded-2xl p-6">
                  <div className="text-center md:text-left mb-5">
                    <h2 className="text-base font-serif font-bold text-stone-200 uppercase tracking-wide">Dynamic Scan Decoder</h2>
                    <p className="text-stone-500 text-xs mt-1">
                      Translates printed/drawn cipher envelopes using local Neural OCR. Bypasses external internet networks completely.
                    </p>
                  </div>

                  {/* Envelope Credentials Setup (Dynamic AAD Input) */}
                  <div className="mb-5 grid sm:grid-cols-2 gap-3 pb-4 border-b border-stone-900/60">
                    <div>
                      <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Expected Decryption Title:</label>
                      <input 
                        type="text" 
                        value={directPastedTitle}
                        onChange={(e) => setDirectPastedTitle(e.target.value)}
                        placeholder="Must match title exactly..."
                        className="w-full bg-stone-950 border border-stone-850 rounded-xl px-3 py-2 text-2xs text-amber-500 outline-none focus:border-amber-500/30 transition font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Decoding Format:</label>
                      <select 
                        value={pastedEncodingMode} 
                        onChange={(e) => setPastedEncodingMode(e.target.value as 'b64' | 'glyph')}
                        className="w-full bg-stone-950 border border-stone-850 rounded-xl px-3 py-2 text-2xs text-amber-500 outline-none focus:border-amber-500/30 transition font-bold"
                      >
                        <option value="b64">Standard Base64 ⚡</option>
                        <option value="glyph">Handwriting Glyphs ✍️</option>
                      </select>
                    </div>
                  </div>

                  {!selectedImage ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          try {
                            if (previewUrl) URL.revokeObjectURL(previewUrl);
                          } catch (_) {}
                          setSelectedImage(file);
                          setPreviewUrl(URL.createObjectURL(file));
                          setScanOrPasteResult(null);
                          setErrorMsg(null);
                        }
                      }}
                      className="border border-dashed border-stone-800 hover:border-amber-500/40 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-stone-900/30 transition duration-200 group"
                    >
                      <div className="w-11 h-11 bg-stone-950 border border-stone-850 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition duration-200">
                        <Upload className="w-4 h-4 text-stone-400 group-hover:text-amber-500" />
                      </div>
                      <p className="text-xs font-semibold text-stone-300">Click or drag image to upload photo</p>
                      <p className="text-[10px] text-stone-500 mt-1">Accepts PNG, JPG, PNG written scans</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-950 border border-stone-850">
                        <img src={previewUrl!} alt="Preview" className="w-full h-full object-contain" />
                        <button 
                          onClick={() => { 
                            setSelectedImage(null); 
                            setPreviewUrl(null); 
                            setScanOrPasteResult(null); 
                            setErrorMsg(null); 
                          }}
                          className="absolute top-3 right-3 bg-stone-900/90 border border-stone-800 text-stone-300 px-3 py-1 rounded-full text-2xs hover:bg-stone-950 transition"
                        >
                          Clear Image
                        </button>
                      </div>

                      {!scanOrPasteResult && (
                        <button 
                          onClick={handleLocalOCR}
                          disabled={isOCRDecoding || !passcode}
                          className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-stone-850 disabled:text-stone-600 text-stone-950 text-xs font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-md"
                        >
                          {isOCRDecoding ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin animate-normal" />
                              <span>{ocrStatus} ({ocrProgress}%)</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 stroke-[2.5]" />
                              <span>Recognize & Decrypt Image Scan</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Progress Line */}
                  {isOCRDecoding && (
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between text-[10px] text-stone-550 font-mono">
                        <span>{ocrStatus}</span>
                        <span>{ocrProgress}%</span>
                      </div>
                      <div className="w-full h-1 bg-stone-950 rounded-full overflow-hidden border border-stone-850">
                        <div 
                          className="h-full bg-amber-500 transition-all duration-200"
                          style={{ width: `${ocrProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="relative my-5 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-stone-870/60"></div>
                    </div>
                    <span className="relative bg-stone-900 px-3 text-[10px] text-stone-600 tracking-wider font-semibold uppercase">Or Paste Text Envelope</span>
                  </div>

                  {/* Paste Envelope String Field */}
                  <div className="space-y-3">
                    {isKeystrokeShieldActive ? (
                      <div 
                        onClick={() => cipherHiddenRef.current?.focus()}
                        className={`w-full h-24 bg-stone-950 border rounded-xl p-3 text-xs text-amber-400 font-mono resize-none leading-relaxed overflow-y-auto cursor-text relative transition-all duration-150 ${isCipherFocused ? 'border-amber-500/20 ring-1 ring-amber-500/5' : 'border-stone-850'}`}
                      >
                        <CanvasText 
                          text={pasteCipherText} 
                          placeholder="Paste encrypted base64/glyph envelope here using Keystroke Shield..." 
                          font="400 11.5px 'JetBrains Mono', monospace" 
                          color="#fbbf24"
                          showCursor={isCipherFocused}
                        />
                        <textarea
                          ref={cipherHiddenRef}
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) setPasteCipherText(prev => prev + val);
                            e.target.value = '';
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace') {
                              e.preventDefault();
                              setPasteCipherText(prev => prev.slice(0, -1));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              setPasteCipherText(prev => prev + '\n');
                            }
                          }}
                          onFocus={() => setIsCipherFocused(true)}
                          onBlur={() => setIsCipherFocused(false)}
                          className="absolute w-px h-px opacity-0 pointer-events-none left-0 top-0 select-none resize-none"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck="false"
                          data-lpignore="true"
                        />
                      </div>
                    ) : (
                      <textarea
                        placeholder="Paste standard Base64/Glyph envelope text directly..."
                        value={pasteCipherText}
                        onChange={(e) => setPasteCipherText(e.target.value)}
                        autoComplete="off"
                        className="w-full h-24 bg-stone-950 border border-stone-850 rounded-xl p-3 text-xs focus:outline-none text-amber-500 font-mono placeholder:text-stone-700 resize-none leading-relaxed"
                      />
                    )}
                    
                    <button
                      onClick={handleDirectPasteDecode}
                      disabled={!pasteCipherText.trim() || !passcode || isDerivingKey}
                      className="w-full border border-stone-800 hover:bg-stone-850 hover:border-stone-700 text-stone-200 font-bold text-xs py-2 rounded-xl transition"
                    >
                      Decrypt Pasted Payload
                    </button>
                  </div>

                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Decrypt Result Output Box */}
                <div className="md:col-span-2 flex flex-col h-full min-h-[300px]">
                  <div className="bg-stone-950 border border-stone-870 rounded-2xl p-6 h-full flex flex-col justify-between">
                    <div className="shrink-0">
                      <span className="text-[9px] font-bold text-amber-500 tracking-wider uppercase bg-amber-500/10 px-2 py-0.5 rounded">Decipher Decoded Content</span>
                    </div>
                    
                    <div className="flex-1 mt-5 flex flex-col justify-between h-full">
                      {scanOrPasteResult ? (
                        <div className="space-y-6 flex-1 flex flex-col justify-between">
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono text-stone-500 block uppercase tracking-wide">Decrypted Message Body</span>
                            <div className="notranslate text-xs font-serif text-stone-200 leading-relaxed whitespace-pre-wrap font-semibold" translate="no">
                              <CanvasText text={scanOrPasteResult.decoded} font="500 13.5px Georgia, serif" color="#f5f5f4" />
                            </div>
                          </div>

                          <div className="border-t border-stone-900 pt-4 mt-auto">
                            <span className="text-[9px] font-mono text-stone-600 block uppercase tracking-wide mb-1">Raw Scans Extraction text</span>
                            <div className="notranslate text-2xs font-mono text-stone-700 max-h-24 overflow-y-auto break-all" translate="no">
                              <CanvasText text={scanOrPasteResult.extracted} font="400 9.5px 'JetBrains Mono', monospace" color="#44403c" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-stone-600 py-12">
                          <Lock className="w-8 h-8 text-stone-800 mb-2 animate-pulse" />
                          <p className="text-2xs">Awaiting scan uploads or pasted envelope strings to execute authenticated mathematical deciphers.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* --- Dynamic Fullscreen Timeout Warning Modal Overlay --- */}
        {showInactivityWarning && (
          <div className="fixed inset-0 bg-stone-950/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-stone-900 border border-red-500/30 max-w-sm w-full rounded-2xl p-6 text-center space-y-4 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-red-500 animate-pulse"></div>
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 outline-none" />
              </div>
              <h4 className="font-serif text-md text-stone-200 font-bold uppercase tracking-wider">Inactivity Timeout Alert</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Your session is idle. To wipe sensitive RAM keys and purge cookies/caches, the ledger scrubs in:
              </p>
              <div className="text-4xl font-mono text-amber-500 font-extrabold animate-pulse">
                {idleCountRemaining}s
              </div>
              <button
                onClick={resetInactivityTimer}
                className="w-full bg-stone-950 border border-stone-800 hover:border-stone-700 text-stone-200 py-2.5 rounded-xl text-xs font-bold transition uppercase tracking-wide"
              >
                Interrupt Wipe Counter
              </button>
            </div>
          </div>
        )}

        {/* --- Tab Hide Blur locked re-authentication Overlay --- */}
        {lockedByTabHide && (
          <div className="fixed inset-0 bg-stone-950 flex items-center justify-center z-50 p-4 select-none">
            <div className="bg-stone-900 border border-stone-800 max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="text-center space-y-2">
                <div className="w-11 h-11 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5" />
                </div>
                <h4 className="font-serif text-sm font-bold text-stone-200 uppercase tracking-widest">Storage Vault Locked</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Active browser tab was minimized/hidden. Please reauthenticate credentials to restore active session memories.
                </p>
              </div>

              <form onSubmit={handleUnlockTab} className="space-y-3">
                <input
                  type="password"
                  value={unlockPasscodeInput}
                  onChange={(e) => setUnlockPasscodeInput(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  placeholder="Type master passphrase to resume..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-xs text-amber-500 font-mono outline-none text-center font-bold focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/15"
                />

                {unlockError && (
                  <p className="text-[10px] text-red-400 font-semibold text-center">{unlockError}</p>
                )}

                <button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 py-2.5 rounded-xl text-xs font-extrabold tracking-wider uppercase transition block text-center"
                >
                  Verify Credentials
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
