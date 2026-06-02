import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

function getSecureKey(): string {
  // Priority 1: Environment variable set in Termux or deployment shell (e.g. export DIARY_MASTER_KEY=...)
  if (process.env.DIARY_MASTER_KEY) {
    return process.env.DIARY_MASTER_KEY;
  }
  if (process.env.CRYPT_DIARY_KEY) {
    return process.env.CRYPT_DIARY_KEY;
  }

  // Priority 2: Private files on device
  const termuxHomePath = "/data/data/com.termux/files/home/.crypt_diary_key";
  const generalHomePath = path.join(os.homedir(), ".crypt_diary_key");
  const localHiddenPath = path.join(process.cwd(), ".crypt_diary_key");

  let selectedPath = localHiddenPath;
  if (fs.existsSync(termuxHomePath)) {
    selectedPath = termuxHomePath;
  } else if (fs.existsSync(generalHomePath)) {
    selectedPath = generalHomePath;
  } else if (fs.existsSync(localHiddenPath)) {
    selectedPath = localHiddenPath;
  } else {
    // Determine where we can write to securely.
    const termuxHomeDir = "/data/data/com.termux/files/home";
    if (fs.existsSync(termuxHomeDir)) {
      selectedPath = termuxHomePath;
    } else {
      selectedPath = generalHomePath;
    }
  }

  try {
    if (fs.existsSync(selectedPath)) {
      const key = fs.readFileSync(selectedPath, "utf-8").trim();
      if (key) return key;
    }

    // Generate highly-secured true high-entropy 64-char key if not exists
    const newKey = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(selectedPath, newKey, { mode: 0o600, encoding: "utf-8" });
    console.log(`Generated and locked secure high-entropy key at: ${selectedPath}`);
    return newKey;
  } catch (error) {
    try {
      if (fs.existsSync(localHiddenPath)) {
        return fs.readFileSync(localHiddenPath, "utf-8").trim();
      }
      const workspaceKey = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(localHiddenPath, workspaceKey, { mode: 0o600, encoding: "utf-8" });
      return workspaceKey;
    } catch {
      return "fallback-super-secure-key-391a27e4";
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // High-accuracy server-side OCR via Gemini 3.5 Flash Model (Sandboxed iframe safe)
  app.post("/api/ocr", async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image file data provided" });
      }

      let cleanBase64 = image;
      let cleanMimeType = mimeType || "image/png";
      if (image.includes(";base64,")) {
        const parts = image.split(";base64,");
        cleanBase64 = parts[1];
        const mimePart = parts[0].match(/data:(.*)/);
        if (mimePart) {
          cleanMimeType = mimePart[1];
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "Gemini API Key is not configured in Settings > Secrets. Image scan features require an active API key." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: cleanMimeType
            }
          },
          "Extract all handwriting, text, characters, letters, and numbers from this image. Only write the extracted content verbatim, exactly as written or printed, with matching line breaks. Do not explain, do not add introductory phrases, and do not add formatting/markdown. If the image is empty or has no readable text, reply with nothing."
        ]
      });

      const text = response.text || "";
      res.json({ text });
    } catch (err: any) {
      console.error("Gemini OCR server error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze image with Gemini AI" });
    }
  });

  // Strict Zero-Cache, Zero-Footprint headers for any incoming request.
  // This directs Chrome and any intermediary proxies never to store or download elements of the app to disk.
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  });

  // Simple clean status check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", cipherEngine: "mathematical-prng" });
  });

  // Secure local retrieval of master key
  app.get("/api/config-key", (req, res) => {
    try {
      const secureKey = getSecureKey();
      res.json({ key: secureKey, secured: true });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to read secure key files" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Support Express SPA routing
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
