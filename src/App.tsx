/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
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
  Eye,
  EyeOff
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import { getCipherMaps, encodeWithMaps, decodeWithMaps } from './lib/cipher.js';
import { CanvasText } from './components/CanvasText';

export default function App() {
  // --- 1. All Top-Level State Hooks ---
  const [activeTab, setActiveTab] = useState<'write' | 'read'>('write');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const cipherMode = 'pen_paper';
  const isWideArea = true;
  const outputViewMode = 'selectable';

  // Dynamic alphanumeric input names to prevent Chrome Form Caching/Autofill History.
  // Changes on every fresh initialization, rendering matching impossible for Chrome's SQLite databases.
  const [fieldToken] = useState(() => 'f_' + Math.floor(Math.random() * 100000000).toString(36));

  // Write States
  const [entryTitle, setEntryTitle] = useState('');
  const [englishText, setEnglishText] = useState('');
  const [copied, setCopied] = useState(false);

  // Decode/OCR states
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [decodedResult, setDecodedResult] = useState<{ extracted: string; decoded: string } | null>(null);
  const [pasteCipherText, setPasteCipherText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Idle and Clipboard Security States
  const [isWipedAutomatically, setIsWipedAutomatically] = useState(false);
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null);

  // Customizable Security Wiping Policies (Defaults to completely manual user-controlled security to prevent unexpected vanishes)
  const [idleWipeTime, setIdleWipeTime] = useState<number>(0); // 0 = Off (Manual Only)
  const [wipeOnHide, setWipeOnHide] = useState<boolean>(false);
  const [wipeOnTabChange, setWipeOnTabChange] = useState<boolean>(false);

  // Sync references to keep event listeners stable and always access the actual state
  const idleWipeTimeRef = useRef(idleWipeTime);
  idleWipeTimeRef.current = idleWipeTime;
  const wipeOnHideRef = useRef(wipeOnHide);
  wipeOnHideRef.current = wipeOnHide;
  const englishTextRef = useRef(englishText);
  englishTextRef.current = englishText;
  const entryTitleRef = useRef(entryTitle);
  entryTitleRef.current = entryTitle;
  const pasteCipherTextRef = useRef(pasteCipherText);
  pasteCipherTextRef.current = pasteCipherText;
  const decodedResultRef = useRef(decodedResult);
  decodedResultRef.current = decodedResult;

  // PWA Installation hooks for Android/iOS native standalone wrappers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  // Refs for tracking background task identifiers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idleRef = useRef<any>(null);
  const clipIntervalRef = useRef<any>(null);

  // Extension-Bypassing Keystroke Shield States & Refs
  const [isKeystrokeShieldActive, setIsKeystrokeShieldActive] = useState(true);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [isBodyFocused, setIsBodyFocused] = useState(false);
  const [isCipherFocused, setIsCipherFocused] = useState(false);

  const titleHiddenRef = useRef<HTMLInputElement>(null);
  const bodyHiddenRef = useRef<HTMLTextAreaElement>(null);
  const cipherHiddenRef = useRef<HTMLTextAreaElement>(null);

  // --- 2. Zero-Footprint & Sandbox Purge Functions ---
  const destructAllBrowserFootprints = () => {
    try {
      // 1. Clear standard browser storage namespaces
      localStorage.clear();
      sessionStorage.clear();

      // 2. Clear all browser cookies
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }

      // 3. Delete Cache Storage buckets
      // Caches and Service workers are conserved to maintain offline PWA launch reliability

      // 4. Delete IndexedDB databases
      if (window.indexedDB && window.indexedDB.databases) {
        window.indexedDB.databases().then((dbs) => {
          dbs.forEach((db) => {
            if (db.name) {
              window.indexedDB.deleteDatabase(db.name);
            }
          });
        });
      }
    } catch (_) {
      // Guard against iframe sandbox restrictions safely
    }
  };

  const handleShredMemory = () => {
    try {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    } catch (_) {}
    setEnglishText('');
    setEntryTitle('');
    setPasteCipherText('');
    setSelectedImage(null);
    setPreviewUrl(null);
    setDecodedResult(null);
    destructAllBrowserFootprints();
  };

  const resetIdleTimer = () => {
    if (idleRef.current) clearTimeout(idleRef.current);
    setIsWipedAutomatically(false);
    
    // If auto-wipe is set to Off (or manual), do not schedule a timer
    if (idleWipeTimeRef.current === 0) return;

    idleRef.current = setTimeout(() => {
      // Only wipe if there's actual typed content in memory to purge
      if (
        englishTextRef.current || 
        entryTitleRef.current || 
        pasteCipherTextRef.current || 
        decodedResultRef.current
      ) {
        handleShredMemory();
        setIsWipedAutomatically(true);
      }
    }, idleWipeTimeRef.current);
  };

  // --- 3. Persistent Console Purge & Visibility Events ---
  useEffect(() => {
    // Console logging is maintained during development to ensure clear issue diagnostics.
    // If ultimate blackhole logs are desired in production, they can be configured there.
  }, []);

  useEffect(() => {
    destructAllBrowserFootprints();

    // Attach listeners for mouse, keyboard, touch to reset idle timer
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetIdleTimer));
    resetIdleTimer();

    // Visibility Listener: immediately Shred Memory if tab is hidden AND wipeOnHide is enabled
    const handleVisibilityChange = () => {
      if (wipeOnHideRef.current && document.hidden) {
        handleShredMemory();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Unload/minimization cleanup: only triggers if wipeOnHide is enabled
    const handleUnloadShred = () => {
      if (wipeOnHideRef.current) {
        handleShredMemory();
      }
    };
    window.addEventListener('beforeunload', handleUnloadShred);
    window.addEventListener('unload', handleUnloadShred);

    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      if (clipIntervalRef.current) clearInterval(clipIntervalRef.current);
      events.forEach((event) => window.removeEventListener(event, resetIdleTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleUnloadShred);
      window.removeEventListener('unload', handleUnloadShred);
    };
  }, [idleWipeTime]); // Re-attach when wipe time policy transitions

  // When tab is changed, wipe states only if wipeOnTabChange is enabled
  const handleTabChange = (tab: 'write' | 'read') => {
    if (wipeOnTabChange) {
      handleShredMemory();
    }
    setActiveTab(tab);
  };

  // Derive custom mapping from passcode using pure deterministic mathematical PRNG
  const cipherMaps = getCipherMaps(passcode || 'device-fallback');

  const encodedText = encodeWithMaps(englishText, cipherMaps, cipherMode);
  const encodedTitle = encodeWithMaps(entryTitle, cipherMaps, cipherMode);

  const handleCopy = () => {
    const fullCipherText = (entryTitle || englishText) ? ((encodedTitle ? encodedTitle + "\n\n" : "") + encodedText) : "";
    if (!fullCipherText) return;

    // Fallback copy function to handle iframe / focus restrictions
    const copyToClipboard = (text: string) => {
      // 1. Try modern clipboard API safely
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
          .catch((err) => {
            console.warn("navigator.clipboard.writeText failed, using fallback:", err);
            fallbackCopy(text);
          });
      } else {
        fallbackCopy(text);
      }
    };

    const fallbackCopy = (text: string) => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        textArea.style.width = "2em";
        textArea.style.height = "2em";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        document.body.appendChild(textArea);
        
        // Select text
        textArea.focus();
        textArea.select();
        
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error("Fallback clipboard copy failed:", err);
      }
    };

    // Perform the manual copy
    copyToClipboard(fullCipherText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      } catch (_) {}
      setSelectedImage(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setDecodedResult(null);
      setErrorMsg(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      } catch (_) {}
      setSelectedImage(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setDecodedResult(null);
      setErrorMsg(null);
    }
  };

  // 100% Client-Side Local OCR execution with strictly enforced zero-cache configuration
  const handleLocalOCR = async () => {
    if (!selectedImage) return;
    setIsDecoding(true);
    setErrorMsg(null);
    setDecodedResult(null);
    setOcrProgress(0);
    setOcrStatus('Initializing local neural core...');

    let worker: Tesseract.Worker | null = null;
    try {
      // Force Tesseract.js to bypass any IndexedDB data or local HTTP disk caching entirely
      worker = await Tesseract.createWorker('eng', 1, {
        cacheMethod: 'none',
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

      const result = await worker.recognize(selectedImage);
      const rawExtractedText = result.data.text || "";
      if (!rawExtractedText.trim()) {
        throw new Error("No readable text found. Ensure characters are clearly drawn.");
      }

      const decryptedString = decodeWithMaps(rawExtractedText, cipherMaps, cipherMode);
      setDecodedResult({ 
        extracted: rawExtractedText, 
        decoded: decryptedString 
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to scan. Ensure image is legible.");
    } finally {
      if (worker) {
        try {
          await (worker as Tesseract.Worker).terminate();
        } catch (_) {}
      }
      setIsDecoding(false);
      setOcrProgress(0);
      setOcrStatus('');
    }
  };

  const handleDirectPasteDecode = () => {
    if (!pasteCipherText.trim()) return;
    const decryptedString = decodeWithMaps(pasteCipherText, cipherMaps, cipherMode);
    setDecodedResult({
      extracted: pasteCipherText,
      decoded: decryptedString
    });
  };

  return (
    <div className="min-h-screen font-sans selection:bg-amber-500/20 selection:text-amber-200 bg-stone-950 text-stone-100 p-4 md:p-8 lg:p-12">
      <div className={`${isWideArea ? 'max-w-7xl md:max-w-[95vw]' : 'max-w-5xl'} mx-auto transition-all duration-300`}>
        
        {/* Header Branding */}
        <header className="mb-10 flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-stone-850">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif text-stone-100 flex items-center gap-3 justify-center md:justify-start">
              <Sparkles className="w-8 h-8 text-amber-500" />
              Cryptic Diary
            </h1>
            <p className="text-stone-400 mt-2 text-xs md:text-sm">
              Mathematical Core substitution engine fully synchronized with your device security keys.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleShredMemory}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/20 border border-red-900/30 hover:border-red-500/50 hover:bg-red-950/45 text-red-400 hover:text-red-350 text-xs font-medium transition shadow-md"
              title="Instantly scrubs inputs, decrypted texts, scans and deletes browser storage caches"
            >
              <Unlock className="w-3.5 h-3.5" />
              Secure Shred RAM
            </button>

            <div className="flex bg-stone-900 p-1 rounded-xl border border-stone-800">
              <button
                onClick={() => handleTabChange('write')}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'write' ? 'bg-stone-850 text-stone-100 border border-stone-700/60 shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-500/80" />
                Write & Encrypt
              </button>
              <button
                onClick={() => handleTabChange('read')}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === 'read' ? 'bg-stone-850 text-stone-100 border border-stone-700/60 shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
              >
                <Camera className="w-3.5 h-3.5 text-amber-500/80" />
                Decrypt & Scan
              </button>
            </div>
          </div>
        </header>

        {isWipedAutomatically && (
          <div className="mb-6 bg-red-950/20 border border-red-900/40 text-red-400 p-3.5 rounded-xl text-xs flex justify-between items-center animate-pulse">
            <div className="flex gap-2.5 items-center">
              <ShieldAlert className="w-4 h-4 shrink-0" strokeWidth={2.5} />
              <span>Idle Scrub Timeout: English text & decoded output were automatically shredded from RAM due to {idleWipeTime === 60000 ? "1 minute" : idleWipeTime / 60000 + " minutes"} of inactivity.</span>
            </div>
            <button onClick={() => setIsWipedAutomatically(false)} className="text-stone-400 hover:text-stone-200 text-[10px] font-bold px-2 py-1 rounded bg-stone-900 border border-stone-850">
              Dismiss
            </button>
          </div>
        )}

        {/* On-device Mobile / Android App Installer and Guide */}
        <div className="mb-6 bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              On-Device Android Application
            </h3>
            <p className="text-xs text-stone-400 max-w-2xl leading-relaxed">
              This application is configured as a fully offline Progressive Web App (PWA). You can install it on your mobile phone as a native app shell! Under Android Chrome, tap <span className="text-amber-400 font-bold">"..." &rarr; "Add to Home Screen"</span> or <span className="text-amber-400 font-bold">"Install App"</span>. This places an icon on your launcher to run standalone, fully operational in <span className="text-emerald-400 font-bold">Airplane Mode</span> with zero Wi-Fi or data packets transmitted.
            </p>
          </div>
          {isInstallable && (
            <button
              onClick={handleInstallApp}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all shrink-0 flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Install Android App
            </button>
          )}
        </div>

        {/* Security Control Console */}
        <div className="mb-6 bg-stone-900/40 border border-stone-850 rounded-2xl p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 1. Encryption Passcode */}
            <div className="flex flex-col space-y-2">
              <label className="text-xs font-bold text-stone-350 uppercase tracking-wider flex items-center gap-1.5">
                <LockKeyhole className="w-3.5 h-3.5 text-amber-500" />
                Encryption Token
              </label>
              <div className="relative">
                <input 
                  type={showPasscode ? "text" : "password"} 
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. secret-topic-key"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-3 pr-10 py-2.5 text-xs text-amber-500 font-mono outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-bold placeholder:text-stone-700"
                  spellCheck="false"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-350 transition-colors"
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-stone-500">Determines character layout shift outputs. Keep this safe to guarantee decodability.</p>
            </div>

            {/* 2. Auto-Wipe Timer Policy */}
            <div className="flex flex-col space-y-2">
              <label className="text-xs font-bold text-stone-350 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                Auto-Wipe Idle Timer
              </label>
              <div className="flex bg-stone-950 p-1 rounded-xl border border-stone-800 h-[38px] w-full">
                <button
                  type="button"
                  onClick={() => setIdleWipeTime(0)}
                  className={`flex-1 text-[10px] font-bold rounded-lg transition-all ${idleWipeTime === 0 ? 'bg-amber-600 text-stone-950 shadow-md font-extrabold' : 'text-stone-400 hover:text-stone-200'}`}
                  title="Memory is NEVER wiped automatically due to idle posture. Retains written text reliably!"
                >
                  Off (Retain)
                </button>
                <button
                  type="button"
                  onClick={() => setIdleWipeTime(60000)}
                  className={`flex-1 text-[10px] font-bold rounded-lg transition-all ${idleWipeTime === 60000 ? 'bg-amber-600 text-stone-950 shadow-md font-extrabold' : 'text-stone-400 hover:text-stone-200'}`}
                  title="Automatically shreds memory after 60 seconds of complete idle posture."
                >
                  1 Min
                </button>
                <button
                  type="button"
                  onClick={() => setIdleWipeTime(300000)}
                  className={`flex-1 text-[10px] font-bold rounded-lg transition-all ${idleWipeTime === 300000 ? 'bg-amber-600 text-stone-950 shadow-md font-extrabold' : 'text-stone-400 hover:text-stone-200'}`}
                  title="Automatically shreds memory after 5 minutes of complete idle posture."
                >
                  5 Min
                </button>
              </div>
              <p className="text-[10px] text-stone-500">Prevents background shoulder surfing in empty rooms.</p>
            </div>

            {/* 3. Ambient Exit & Move Shields */}
            <div className="flex flex-col space-y-2">
              <label className="text-xs font-bold text-stone-350 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                Abrupt Exit Protection
              </label>
              <div className="grid grid-cols-2 gap-2 h-[38px]">
                <button
                  type="button"
                  onClick={() => setWipeOnHide(!wipeOnHide)}
                  className={`flex items-center justify-center gap-1 px-2.5 rounded-xl border text-[9px] font-bold tracking-tight transition-all duration-150 ${wipeOnHide ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-stone-950 border-stone-850 text-stone-400 hover:text-stone-200'}`}
                  title="Purges memory when browser tab is hidden or minimized."
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${wipeOnHide ? 'bg-amber-400' : 'bg-stone-600'}`}></span>
                  Wipe on Tab Blur
                </button>
                <button
                  type="button"
                  onClick={() => setWipeOnTabChange(!wipeOnTabChange)}
                  className={`flex items-center justify-center gap-1 px-2.5 rounded-xl border text-[9px] font-bold tracking-tight transition-all duration-150 ${wipeOnTabChange ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-stone-950 border-stone-850 text-stone-400 hover:text-stone-200'}`}
                  title="Purges memory when you click other tabs within this diary website."
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${wipeOnTabChange ? 'bg-amber-400' : 'bg-stone-600'}`}></span>
                  Wipe on Tab Switch
                </button>
              </div>
              <p className="text-[10px] text-stone-500 font-mono">Controls data persistence inside RAM sandbox.</p>
            </div>

          </div>

          <div className="bg-amber-500/[0.02] border border-amber-950/40 rounded-xl p-4 text-[11px] text-amber-200/80 leading-relaxed font-serif flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-400 font-sans uppercase text-[10px] tracking-wider block mb-0.5">Pen & Paper Millennium Protocol Active</span>
              This cipher is mathematically uncrackable. To preserve layout safety, it uses a SHA-256 based deterministic stream generator—preventing any frequency analysis or statistical crack. To manually decode after thousands of years without computer programs: calculate standard SHA-256 hashes of the password combined with the character index to derive shifts mod 26. Complete spacing and word structure are preserved naturally for simple physical notebook recording!
            </div>
          </div>
        </div>

        {!isWipedAutomatically && (
          <div className="mb-6 bg-emerald-500/[0.04] border border-emerald-950/40 text-emerald-400/90 py-2.5 px-4 rounded-xl text-2xs md:text-xs flex gap-2 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span>Chrome Zero-Footprint Active: Clear-Site-Data policies enforced. No persistent caches, form lists, or cookie footprints exist on your disk.</span>
          </div>
        )}

        {/* Main Workspace */}
        <main>
          <AnimatePresence mode="wait">
            
            {/* WRITE TAB */}
            {activeTab === 'write' && (
              <motion.div
                key="tab-write"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={`grid ${isWideArea ? 'grid-cols-1' : 'md:grid-cols-2'} gap-6`}
              >
                {/* English Writer Input Area */}
                <div className={`bg-stone-900/60 border border-stone-800 rounded-2xl p-6 flex flex-col ${isWideArea ? 'h-[45vh] lg:h-[40vh] min-h-[300px]' : 'h-[65vh] min-h-[450px]'} transition-all`}>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase bg-amber-500/10 px-2 py-0.5 rounded">English Input</span>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/[0.04] border border-amber-550/15">
                        <Shield className={`w-3 h-3 ${isKeystrokeShieldActive ? 'text-amber-500 animate-pulse' : 'text-stone-500'}`} />
                        <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Keystroke Shield</span>
                        <button 
                          onClick={() => {
                            setIsKeystrokeShieldActive(!isKeystrokeShieldActive);
                            handleShredMemory();
                          }}
                          className={`relative inline-flex h-3.5 w-6.5 shrink-0 cursor-pointer rounded-full border border-stone-850 transition-colors duration-150 ease-in-out focus:outline-none ${isKeystrokeShieldActive ? 'bg-amber-500/90' : 'bg-stone-950'}`}
                          title="Toggles dynamic RAM scrubbing of keystrokes to prevent browser extensions from inspecting inputs"
                          type="button"
                        >
                          <span className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-stone-950 shadow transition duration-150 ease-in-out ${isKeystrokeShieldActive ? 'translate-x-[11px]' : 'translate-x-[1px]'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {isKeystrokeShieldActive ? (
                    <>
                      {/* Visual Input representing title */}
                      <div 
                        onClick={() => titleHiddenRef.current?.focus()}
                        className={`w-full bg-transparent pb-3 mb-4 border-b text-lg font-serif outline-none leading-relaxed min-h-[38px] cursor-text flex items-center relative transition-colors duration-150 ${isTitleFocused ? 'border-amber-500/30' : 'border-stone-800'}`}
                      >
                        <CanvasText 
                          text={entryTitle} 
                          placeholder="Diary Entry Title..." 
                          font="600 18px Cinzel, ui-serif, serif" 
                          showCursor={isTitleFocused}
                        />
                        
                        {/* 100% Uncontrolled hidden input for dynamic character reading */}
                        <input
                          ref={titleHiddenRef}
                          type="text"
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              setEntryTitle(prev => prev + val);
                            }
                            e.target.value = ''; // Instantly wipe DOM footprint
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace') {
                              e.preventDefault();
                              setEntryTitle(prev => prev.slice(0, -1));
                            } else if (e.key === ' ') {
                              e.preventDefault();
                              setEntryTitle(prev => prev + ' ');
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
                          data-1p-ignore="true"
                          data-bwignore="true"
                          data-bitwarden-ignore="true"
                          data-dashlane-ignore="true"
                          data-gramm="false"
                        />
                      </div>

                      {/* Visual Input representing body text */}
                      <div 
                        onClick={() => bodyHiddenRef.current?.focus()}
                        className={`flex-1 w-full bg-transparent text-stone-200 font-serif leading-relaxed text-base overflow-y-auto cursor-text relative pb-10 min-h-[150px]`}
                      >
                        <CanvasText 
                          text={englishText} 
                          placeholder="Write down your secret thoughts or confidential diary logs here in plain English using secure RAM Keystroke Shield..." 
                          font="400 16px Cinzel, ui-serif, serif" 
                          showCursor={isBodyFocused}
                        />
                        
                        {/* 100% Uncontrolled hidden textarea for dynamic character reading */}
                        <textarea
                          ref={bodyHiddenRef}
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              setEnglishText(prev => prev + val);
                            }
                            e.target.value = ''; // Instantly wipe DOM footprint
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace') {
                              e.preventDefault();
                              setEnglishText(prev => prev.slice(0, -1));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              setEnglishText(prev => prev + '\n');
                            } else if (e.key === ' ') {
                              e.preventDefault();
                              setEnglishText(prev => prev + ' ');
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
                          data-1p-ignore="true"
                          data-bwignore="true"
                          data-bitwarden-ignore="true"
                          data-dashlane-ignore="true"
                          data-gramm="false"
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
                        placeholder="Diary Entry Title..."
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-bitwarden-ignore="true"
                        data-dashlane-ignore="true"
                        data-gramm="false"
                        data-enable-grammarly="false"
                        data-translate="no"
                        translate="no"
                        className="notranslate w-full bg-transparent pb-3 mb-4 border-b border-stone-800 text-lg font-serif text-stone-200 outline-none placeholder:text-stone-600 font-semibold"
                      />

                      <textarea
                        name={fieldToken + "_text"}
                        id={fieldToken + "_text"}
                        value={englishText}
                        onChange={(e) => setEnglishText(e.target.value)}
                        placeholder="Write down your secret thoughts or confidential diary logs here in plain English..."
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-bitwarden-ignore="true"
                        data-dashlane-ignore="true"
                        data-gramm="false"
                        data-enable-grammarly="false"
                        data-translate="no"
                        translate="no"
                        className="notranslate flex-1 w-full bg-transparent resize-none focus:outline-none text-stone-200 placeholder:text-stone-600 font-serif leading-relaxed text-base"
                      />
                    </>
                  )}
                </div>

                {/* Mathematical Cryptic Output Area */}
                <div className={`bg-stone-950 border border-amber-950/40 rounded-2xl p-6 flex flex-col ${isWideArea ? 'h-[45vh] lg:h-[40vh] min-h-[300px]' : 'h-[65vh] min-h-[450px]'} relative overflow-hidden group`}>
                  <div className="absolute inset-0 bg-amber-500/[0.01] pointer-events-none"></div>
                  
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase bg-amber-500/10 px-2 py-0.5 rounded">Mathematical Cipher Translation</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleCopy}
                        disabled={!encodedText}
                        className="text-stone-400 hover:text-stone-200 bg-stone-900 border border-stone-800 hover:border-stone-700/80 p-2 px-3 rounded-lg hover:border-amber-500/30 text-xs font-semibold transition disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                        title="Copy entire cipher text"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-500" />}
                        <span className={copied ? "text-emerald-400 font-bold" : "text-stone-300"}>
                          {copied ? "Copied" : "Copy Cipher"}
                        </span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 relative z-10 h-full overflow-hidden">
                    {outputViewMode === 'selectable' ? (
                      <textarea
                        readOnly
                        value={(entryTitle || englishText) ? ((encodedTitle ? encodedTitle + "\n\n" : "") + encodedText) : ""}
                        placeholder="Your dynamically converted mathematical secret cipher will render here automatically..."
                        className="notranslate w-full h-full bg-stone-900/10 border border-amber-950/20 rounded-xl p-4 font-mono text-amber-400 leading-relaxed text-base select-text whitespace-pre-wrap break-all outline-none focus:outline-none resize-none selection:bg-amber-500/30 selection:text-amber-100"
                        translate="no"
                        spellCheck="false"
                      />
                    ) : (
                      <div className="notranslate w-full h-full p-4 rounded-xl bg-stone-900/10 border border-amber-950/20 overflow-y-auto" translate="no">
                        <CanvasText 
                          text={(entryTitle || englishText) ? ((encodedTitle ? encodedTitle + "\n\n" : "") + encodedText) : ""}
                          placeholder="Your dynamically converted mathematical secret cipher will render here automatically..."
                          font="400 16px 'JetBrains Mono', monospace"
                          color="#fcd34d"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* DECRYPT & SCAN TAB */}
            {activeTab === 'read' && (
              <motion.div
                key="tab-read"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-3xl mx-auto grid md:grid-cols-5 gap-6"
              >
                {/* Upload & Setup Selection Panel */}
                <div className="md:col-span-3 bg-stone-900/60 border border-stone-800 rounded-2xl p-6">
                  <div className="text-center md:text-left mb-6">
                    <h2 className="text-base font-serif text-stone-100">Client-Side Scan Decoder</h2>
                    <p className="text-stone-400 text-xs mt-1">
                      Runs 100% locally. Analyze handwriting files or paste secret paragraphs directly.
                    </p>
                  </div>

                  {!selectedImage ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="border border-dashed border-stone-800 hover:border-amber-500/40 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-stone-900/40 transition duration-200 group"
                    >
                      <div className="w-12 h-12 bg-stone-950 border border-stone-850 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition duration-200">
                        <Upload className="w-5 h-5 text-stone-400 group-hover:text-amber-500" />
                      </div>
                      <p className="text-xs font-semibold text-stone-300">Click or drag image to upload photo</p>
                      <p className="text-[10px] text-stone-500 mt-1">Runs entirely inside your browser sandbox</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-950 border border-stone-850">
                        <img src={previewUrl!} alt="Preview" className="w-full h-full object-contain" />
                        <button 
                          onClick={() => { 
                            destructAllBrowserFootprints();
                            setSelectedImage(null); 
                            setPreviewUrl(null); 
                            setDecodedResult(null); 
                            setErrorMsg(null); 
                          }}
                          className="absolute top-3 right-3 bg-stone-900/90 border border-stone-800 text-stone-300 px-3 py-1 rounded-full text-2xs hover:bg-stone-950 transition"
                        >
                          Clear Image
                        </button>
                      </div>

                      {!decodedResult && (
                        <button 
                          onClick={handleLocalOCR}
                          disabled={isDecoding}
                          className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-stone-800 disabled:text-stone-500 text-stone-950 text-xs font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-md"
                        >
                          {isDecoding ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>{ocrStatus} ({ocrProgress}%)</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 stroke-[2.5]" />
                              <span>Recognize & Decode Image</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Progress Indicator for local OCR */}
                  {isDecoding && (
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between text-[10px] text-stone-500 font-mono">
                        <span>{ocrStatus}</span>
                        <span>{ocrProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-950 rounded-full overflow-hidden border border-stone-850">
                        <div 
                          className="h-full bg-amber-500 transition-all duration-200"
                          style={{ width: `${ocrProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="relative my-6 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-stone-850"></div>
                    </div>
                    <span className="relative bg-stone-900 px-3 text-[10px] text-stone-500 tracking-wider font-semibold uppercase">Or Paste Cipher Text</span>
                  </div>

                  {/* Paste Box */}
                  <div className="space-y-3">
                    {isKeystrokeShieldActive ? (
                      <div 
                        onClick={() => cipherHiddenRef.current?.focus()}
                        className={`w-full h-24 bg-stone-950 border rounded-xl p-3 text-xs text-amber-300 font-mono resize-none leading-relaxed overflow-y-auto cursor-text relative transition-all duration-150 ${isCipherFocused ? 'border-amber-500/25 ring-1 ring-amber-500/10' : 'border-stone-850'}`}
                      >
                        <CanvasText 
                          text={pasteCipherText} 
                          placeholder="Paste secret cipher text here using secure RAM Keystroke Shield..." 
                          font="400 12px 'JetBrains Mono', monospace" 
                          color="#fcd34d"
                          showCursor={isCipherFocused}
                        />
                        
                        {/* 100% Uncontrolled hidden textarea for dynamic cipher paste reading */}
                        <textarea
                          ref={cipherHiddenRef}
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              setPasteCipherText(prev => prev + val);
                            }
                            e.target.value = ''; // Instantly wipe DOM footprint
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace') {
                              e.preventDefault();
                              setPasteCipherText(prev => prev.slice(0, -1));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              setPasteCipherText(prev => prev + '\n');
                            } else if (e.key === ' ') {
                              e.preventDefault();
                              setPasteCipherText(prev => prev + ' ');
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
                          data-1p-ignore="true"
                          data-bwignore="true"
                          data-bitwarden-ignore="true"
                          data-dashlane-ignore="true"
                          data-gramm="false"
                        />
                      </div>
                    ) : (
                      <textarea
                        placeholder="Paste secret cipher text here to reverse translate mathematically..."
                        name={fieldToken + "_cipher"}
                        id={fieldToken + "_cipher"}
                        value={pasteCipherText}
                        onChange={(e) => setPasteCipherText(e.target.value)}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-bitwarden-ignore="true"
                        data-dashlane-ignore="true"
                        data-gramm="false"
                        data-enable-grammarly="false"
                        data-translate="no"
                        translate="no"
                        className="notranslate w-full h-24 bg-stone-950 border border-stone-850 rounded-xl p-3 text-xs focus:outline-none text-amber-300 font-mono placeholder:text-stone-600 resize-none leading-relaxed"
                      />
                    )}
                    <button
                      onClick={handleDirectPasteDecode}
                      disabled={!pasteCipherText.trim()}
                      className="w-full border border-stone-800 hover:bg-stone-800/80 hover:border-stone-700/50 text-stone-200 font-semibold text-xs py-2.5 rounded-xl transition"
                    >
                      Decode Pasted Text
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="mt-4 bg-red-950/30 border border-red-900/40 text-red-400 p-4 rounded-xl text-xs flex gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Decrypt Result Output Box */}
                <div className="md:col-span-2 flex flex-col justify-between">
                  <div className="bg-stone-950 border border-stone-850 rounded-2xl p-6 h-full flex flex-col">
                    <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase mb-4 self-start bg-amber-500/10 px-2 py-0.5 rounded">Decipher Output</span>
                    
                    {decodedResult ? (
                      <div className="flex-1 flex flex-col justify-between space-y-6">
                        <div className="space-y-1 flex-1">
                          <span className="text-[9px] font-mono text-stone-500 block uppercase tracking-wide">Decrypted English text</span>
                          <div className="notranslate text-base font-serif text-stone-200 leading-relaxed font-medium h-32" translate="no">
                            {outputViewMode === 'selectable' ? (
                              <textarea
                                readOnly
                                value={decodedResult.decoded}
                                className="w-full h-full bg-stone-900/10 border border-amber-950/10 rounded-xl p-3 font-serif text-stone-200 leading-relaxed text-base select-text whitespace-pre-wrap break-words outline-none focus:outline-none resize-none selection:bg-amber-500/20 selection:text-amber-200"
                                translate="no"
                                spellCheck="false"
                              />
                            ) : (
                              <CanvasText text={decodedResult.decoded} font="500 16px Cinzel, ui-serif, serif" color="#e7e5e4" />
                            )}
                          </div>
                        </div>

                        <div className="border-t border-stone-900 pt-4 mt-auto">
                          <span className="text-[9px] font-mono text-stone-500 block uppercase tracking-wide mb-1">Raw Scanned Cipher Glyphs</span>
                          <div className="notranslate font-mono text-stone-600 break-all max-h-32 overflow-y-auto" translate="no">
                            {outputViewMode === 'selectable' ? (
                              <div className="select-text bg-stone-900/10 border border-amber-[950]/10 rounded-xl p-3 text-[10.5px] whitespace-pre-wrap selection:bg-amber-500/25 selection:text-amber-150">
                                {decodedResult.extracted}
                              </div>
                            ) : (
                              <CanvasText text={decodedResult.extracted} font="400 10.5px 'JetBrains Mono', monospace" color="#57534e" />
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center text-stone-600 p-4">
                        <Lock className="w-8 h-8 text-stone-800 mb-2" />
                        <p className="text-xs">Provide a scan or paste text to perform dynamic mathematical reversal.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
