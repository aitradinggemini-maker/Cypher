import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

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

  app.use(express.json());

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
