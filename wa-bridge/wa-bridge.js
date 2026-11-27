/**
 * ============================================================================
 * MASSINISSA SCHOOL — STANDALONE ZERO-CODEBASE WHATSAPP BRIDGE (v2.0)
 * ============================================================================
 * - Zero school source code, zero Prisma schema, zero DATABASE_URL on PC!
 * - Outbound HTTPS Cloud-Sync with Vercel (/api/whatsapp/bridge):
 *   -> No Cloudflare Tunnel, no port-forwarding, no static IP needed!
 * - Real-time Waterfall WhatsApp Check (Student Global -> Parent 1 -> Parent 2)
 * - Auto-triggers the 24-Hour Pre-Lesson (-1 Balance) Cloud Cron hourly
 * - Also exposes 127.0.0.1:5001 (protected by x-api-key) for local/OCI mode
 * ============================================================================
 */

import http from "http";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, "wa_bridge_config.json");
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(__dirname, "wa-session");
const LOG_FILE = path.join(__dirname, "wa-bridge.log");
const DEFAULT_CLOUD_APP_URL = "https://classty-massinissa-school.vercel.app";
const DEFAULT_SECRET = "massinissa_secret_key_2026";
const DEFAULT_PORT = 5001;

// Rolling file logger (keeps last 300 lines inspectable for background VBS service)
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origErr = console.error.bind(console);
let logBuffer = [];

function writeLog(level, args) {
  try {
    const text = args
      .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a)))
      .join(" ");
    const line = `[${new Date().toISOString()}] [${level}] ${text}`;
    logBuffer.push(line);
    if (logBuffer.length > 300) {
      logBuffer = logBuffer.slice(-250);
      fs.writeFileSync(LOG_FILE, logBuffer.join("\r\n") + "\r\n", "utf8");
    } else {
      fs.appendFileSync(LOG_FILE, line + "\r\n", "utf8");
    }
  } catch {}
}

console.log = (...args) => {
  origLog(...args);
  writeLog("INFO", args);
};
console.warn = (...args) => {
  origWarn(...args);
  writeLog("WARN", args);
};
console.error = (...args) => {
  origErr(...args);
  writeLog("ERROR", args);
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) || {};
    }
  } catch {}
  return {};
}

function saveConfig(partial) {
  const current = loadConfig();
  const next = {
    cloudAppUrl: DEFAULT_CLOUD_APP_URL,
    bridgeSecret: DEFAULT_SECRET,
    port: DEFAULT_PORT,
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

const savedCfg = loadConfig();
const CLOUD_APP_URL = (
  process.env.CLOUD_APP_URL ||
  savedCfg.cloudAppUrl ||
  DEFAULT_CLOUD_APP_URL
).replace(/\/+$/, "");
const API_KEY =
  process.env.WHATSAPP_BRIDGE_SECRET || savedCfg.bridgeSecret || DEFAULT_SECRET;
const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT || savedCfg.port || DEFAULT_PORT);

// ============================================================================
// CLI COMMANDS (--setup, --stop, --diag)
// ============================================================================

async function runSetupWizard() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  origLog("======================================================================");
  origLog("  CONFIGURATION DU PONT WHATSAPP — MASSINISSA SCHOOL");
  origLog("======================================================================");

  const curUrl = savedCfg.cloudAppUrl || DEFAULT_CLOUD_APP_URL;
  const inUrl = (await ask(`1. URL de l'application Cloud [${curUrl}] : `)).trim();
  const finalUrl = (inUrl || curUrl).replace(/\/+$/, "");

  const hasCustomSecret = savedCfg.bridgeSecret && savedCfg.bridgeSecret !== DEFAULT_SECRET;
  const secretPrompt = hasCustomSecret
    ? "2. Cle secrete WHATSAPP_BRIDGE_SECRET [Entree pour conserver l'actuelle] : "
    : `2. Cle secrete WHATSAPP_BRIDGE_SECRET [Entree = par defaut] : `;
  const inSecret = (await ask(secretPrompt)).trim();
  const finalSecret = inSecret || savedCfg.bridgeSecret || DEFAULT_SECRET;

  rl.close();

  saveConfig({
    cloudAppUrl: finalUrl,
    bridgeSecret: finalSecret,
    port: PORT,
  });

  // Register Windows Startup silent launcher (.vbs)
  if (process.platform === "win32" && process.env.APPDATA) {
    try {
      const startupDir = path.join(
        process.env.APPDATA,
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        "Startup"
      );
      if (fs.existsSync(startupDir)) {
        const vbsPath = path.join(startupDir, "MassinissaWhatsAppBridge.vbs");
        const escapedScript = __filename.replace(/"/g, '""');
        const vbsContent = [
          'Set WshShell = CreateObject("WScript.Shell")',
          `WshShell.CurrentDirectory = "${__dirname.replace(/"/g, '""')}"`,
          `WshShell.Run "node ""${escapedScript}""", 0, False`,
          "",
        ].join("\r\n");
        fs.writeFileSync(vbsPath, vbsContent, "utf8");
        origLog(`[OK] Demarrage automatique Windows active : ${vbsPath}`);
      }
    } catch (e) {
      origWarn("[WARN] Impossible de creer le raccourci Startup Windows :", e.message);
    }
  }

  origLog("[OK] Configuration enregistree dans wa_bridge_config.json");
}

async function runStopCommand() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/internal/shutdown`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      origLog(`[OK] Ancien service WhatsApp Bridge (port ${PORT}) arrete proprement.`);
      await new Promise((r) => setTimeout(r, 800));
      return;
    }
  } catch {}
  origLog(`[INFO] Aucun service actif detecte sur le port ${PORT}.`);
}

async function runDiagCommand() {
  origLog("----------------------------------------------------------------------");
  origLog("  DIAGNOSTIC DU PONT WHATSAPP — MASSINISSA SCHOOL");
  origLog("----------------------------------------------------------------------");
  origLog(`  Serveur Cloud Cible : ${CLOUD_APP_URL}`);
  origLog(`  Port Local          : http://127.0.0.1:${PORT}`);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/session/status`, {
      headers: { "x-api-key": API_KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      origLog(`  Etat du Service     : ERREUR HTTP ${res.status} (Verifiez la cle secrete)`);
      return;
    }
    const data = await res.json();
    origLog("  Etat du Service     : EN LIGNE (Actif en arriere-plan)");
    origLog(
      `  Connexion WhatsApp  : ${
        data.isConnected
          ? `CONNECTE (+${data.phone || ""} - ${data.name || ""})`
          : "EN ATTENTE DE SCAN QR (Ouvrez Configuration > WhatsApp sur le site)"
      }`
    );
    origLog(
      `  Synchronisation Web : ${
        data.lastCloudSyncOk
          ? `OK (${data.lastCloudSyncAt})`
          : `En attente / Verifiez URL & Secret (${data.lastCloudError || "initialisation..."})`
      }`
    );
  } catch {
    origLog("  Etat du Service     : HORS LIGNE (Lancez INSTALLER_ET_DEMARRER_PONT_WA.bat)");
  }
  origLog("----------------------------------------------------------------------");
}

const cliArgs = process.argv.slice(2);
if (cliArgs.includes("--setup")) {
  await runSetupWizard();
  process.exit(0);
}
if (cliArgs.includes("--stop")) {
  await runStopCommand();
  process.exit(0);
}
if (cliArgs.includes("--diag")) {
  await runDiagCommand();
  process.exit(0);
}

// ============================================================================
// RUNTIME STATE & CLOUD SYNC ENGINE
// ============================================================================

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let currentQrDataUrl = null;
let isConnected = false;
let connectedPhone = null;
let connectedName = null;
let isSyncing = false;
let isProcessingJobs = false;
let lastCloudSyncOk = false;
let lastCloudSyncAt = null;
let lastCloudError = null;

const sseClients = [];

function broadcastSseEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

function cleanPhoneDigits(raw) {
  if (!raw) return null;
  let cleaned = String(raw).replace(/[\s\.\-\(\)\+]/g, "").trim();
  if (cleaned.startsWith("00213")) cleaned = cleaned.substring(2);
  if (/^0[567]\d{8}$/.test(cleaned)) cleaned = "213" + cleaned.substring(1);
  if (/^\d{8,15}$/.test(cleaned)) return cleaned;
  return null;
}

async function postToCloud(endpoint, payload, timeoutMs = 10000) {
  if (!CLOUD_APP_URL) return null;
  const res = await fetch(`${CLOUD_APP_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
  }
  return res.json();
}

/**
 * Waterfall Verification + Send on the live Baileys socket:
 * Checks Student Global Number -> Parent 1 -> Parent 2 -> Family Payer
 */
async function processPulledJobs(jobs) {
  if (isProcessingJobs || !Array.isArray(jobs) || jobs.length === 0) return;
  isProcessingJobs = true;

  try {
    for (const job of jobs) {
      if (!sock || !isConnected) break;

      const rawCandidates = Array.isArray(job.candidates) && job.candidates.length > 0
        ? job.candidates
        : job.recipientPhone
        ? [
            {
              phone: job.recipientPhone,
              type: job.recipientType || "STUDENT_PRIMARY",
              name: job.recipientName || "",
            },
          ]
        : [];

      const checkedNumbers = [];
      let winner = null;

      for (const cand of rawCandidates) {
        const norm = cleanPhoneDigits(cand.phone);
        if (!norm) continue;
        const jid = `${norm}@s.whatsapp.net`;
        try {
          const [check] = await sock.onWhatsApp(jid);
          const exists = Boolean(check?.exists);
          checkedNumbers.push({
            phone: norm,
            type: cand.type || "PARENT_PHONE",
            hasWhatsApp: exists,
          });
          if (exists) {
            winner = {
              phone: norm,
              jid: check.jid || jid,
              type: cand.type || "STUDENT_PRIMARY",
              name: cand.name || null,
            };
            break; // Waterfall complete on first valid WhatsApp account!
          }
        } catch (checkErr) {
          console.warn(`[WA Bridge] onWhatsApp check failed for ${norm}:`, checkErr.message);
        }
      }

      if (!winner) {
        await postToCloud("/api/whatsapp/bridge", {
          action: "report-result",
          notificationId: job.id,
          status: "FAILED_NO_WHATSAPP",
          checkedNumbers,
          errorMessage: "Aucun numéro enregistré sur WhatsApp",
        }).catch((e) => console.error("[WA Bridge] Report FAILED_NO_WHATSAPP error:", e.message));
        continue;
      }

      try {
        const sentMsg = await sock.sendMessage(winner.jid, { text: job.text });
        await postToCloud("/api/whatsapp/bridge", {
          action: "report-result",
          notificationId: job.id,
          status: "SENT",
          messageId: sentMsg?.key?.id || null,
          recipientPhone: winner.phone,
          recipientType: winner.type,
          recipientName: winner.name,
          checkedNumbers,
        });
        console.log(`[WA Bridge] Sent notification ${job.id} -> +${winner.phone} (${winner.type})`);
      } catch (sendErr) {
        console.error(`[WA Bridge] Send failed for ${job.id}:`, sendErr.message);
        await postToCloud("/api/whatsapp/bridge", {
          action: "report-result",
          notificationId: job.id,
          status: "FAILED_ERROR",
          errorMessage: sendErr?.message || "Send failed",
          checkedNumbers,
        }).catch(() => {});
      }

      // Anti-Ban randomized interval between messages (default 4s - 8s)
      const minSec = Math.max(1, Number(job.minIntervalSeconds || 4));
      const maxSec = Math.max(minSec, Number(job.maxIntervalSeconds || 8));
      const delayMs = Math.floor((minSec + Math.random() * (maxSec - minSec)) * 1000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  } finally {
    isProcessingJobs = false;
  }
}

async function performDisconnectAndReset() {
  console.log("[WA Bridge] Executing disconnect command...");
  try {
    if (sock) await sock.logout();
  } catch {}
  isConnected = false;
  connectedPhone = null;
  connectedName = null;
  currentQrDataUrl = null;
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch {}
  broadcastSseEvent("status", { isConnected: false });
  setTimeout(startSocket, 1500);
}

async function syncWithCloud() {
  if (isSyncing || !CLOUD_APP_URL) return;
  isSyncing = true;
  try {
    const data = await postToCloud("/api/whatsapp/bridge", {
      action: "sync-status",
      isConnected,
      phone: connectedPhone,
      name: connectedName,
      qr: isConnected ? null : currentQrDataUrl,
      pullJobs: isConnected && !isProcessingJobs,
    });

    lastCloudSyncOk = true;
    lastCloudSyncAt = new Date().toLocaleTimeString("fr-FR");
    lastCloudError = null;

    if (data?.command === "DISCONNECT") {
      await performDisconnectAndReset();
      return;
    }

    if (isConnected && !isProcessingJobs && Array.isArray(data?.jobs) && data.jobs.length > 0) {
      processPulledJobs(data.jobs);
    }
  } catch (err) {
    lastCloudSyncOk = false;
    lastCloudError = err?.message || "Unreachable";
  } finally {
    isSyncing = false;
  }
}

async function trigger24hCloudCron() {
  if (!CLOUD_APP_URL) return;
  try {
    const res = await postToCloud("/api/cron/whatsapp-24h", { source: "wa-bridge" }, 25000);
    if (res?.stagedCount > 0) {
      console.log(`[WA Bridge] 24h Pre-Lesson Cron staged ${res.stagedCount} reminder(s).`);
    }
  } catch (err) {
    console.warn("[WA Bridge] 24h Cron ping skipped/failed:", err.message);
  }
}

// ============================================================================
// BAILEYS MULTI-DEVICE SOCKET
// ============================================================================

let isStartingSocket = false;

async function startSocket() {
  if (isStartingSocket) return;
  isStartingSocket = true;

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
      console.log(`[WA Bridge] WhatsApp Web v${version.join(".")}`);
    } catch {
      console.warn("[WA Bridge] Using bundled WhatsApp Web version");
    }

    sock = makeWASocket({
      ...(version ? { version } : {}),
      logger: pino({ level: "silent" }),
      auth: state,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr);
          const asciiQr = await QRCode.toString(qr, { type: "terminal", small: true }).catch(
            () => ""
          );
          if (asciiQr) origLog("\n" + asciiQr);
          console.log("[WA Bridge] Nouveau QR Code genere -> Synchronisation avec le Cloud...");
          broadcastSseEvent("qr", { qr: currentQrDataUrl });
          syncWithCloud();
        } catch (err) {
          console.error("[WA Bridge] QR generation error:", err.message);
        }
      }

      if (connection === "close") {
        isConnected = false;
        connectedPhone = null;
        connectedName = null;
        currentQrDataUrl = null;
        broadcastSseEvent("status", { isConnected: false });
        syncWithCloud();

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`[WA Bridge] Connexion fermee (code: ${statusCode}). Reconnexion: ${!loggedOut}`);

        if (loggedOut) {
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch {}
        }
        setTimeout(startSocket, 3000);
      } else if (connection === "open") {
        isConnected = true;
        currentQrDataUrl = null;
        const userJid = sock?.user?.id || "";
        connectedPhone = userJid.split(":")[0] || userJid.split("@")[0] || null;
        connectedName = sock?.user?.name || "Massinissa School";

        console.log(`[WA Bridge] Connecte a WhatsApp : +${connectedPhone} (${connectedName})`);
        broadcastSseEvent("status", {
          isConnected: true,
          phone: connectedPhone,
          name: connectedName,
        });
        syncWithCloud();
      }
    });

    // Forward parent incoming replies to Cloud App
    sock.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify") return;
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        const fromJid = msg.key.remoteJid || "";
        if (!fromJid.endsWith("@s.whatsapp.net")) continue;
        const text =
          msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (text.trim()) {
          const fromPhone = fromJid.split("@")[0];
          postToCloud("/api/whatsapp/bridge", {
            action: "incoming-reply",
            fromPhone,
            text: text.trim().slice(0, 500),
          }).catch(() => {});
        }
      }
    });
  } catch (err) {
    console.error("[WA Bridge] Socket startup error:", err.message);
    setTimeout(startSocket, 5000);
  } finally {
    isStartingSocket = false;
  }
}

// ============================================================================
// LOCAL HTTP SERVER (127.0.0.1:5001) — ALL ROUTES PROTECTED BY x-api-key
// ============================================================================

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const reqKey = req.headers["x-api-key"] || url.searchParams.get("apiKey");

  if (reqKey !== API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const readJsonBody = () =>
    new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
    });

  if (req.method === "POST" && url.pathname === "/internal/shutdown") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    setTimeout(() => process.exit(0), 150);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        isConnected,
        phone: connectedPhone,
        name: connectedName,
        qr: isConnected ? null : currentQrDataUrl,
        lastCloudSyncOk,
        lastCloudSyncAt,
        lastCloudError,
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session/qr-stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.push(res);
    res.write(
      `event: status\ndata: ${JSON.stringify({
        isConnected,
        phone: connectedPhone,
        name: connectedName,
      })}\n\n`
    );
    if (currentQrDataUrl && !isConnected) {
      res.write(`event: qr\ndata: ${JSON.stringify({ qr: currentQrDataUrl })}\n\n`);
    }
    req.on("close", () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/check-number") {
    try {
      const body = await readJsonBody();
      const norm = cleanPhoneDigits(body.phone);
      if (!norm) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid phone" }));
        return;
      }
      if (!sock || !isConnected) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "WhatsApp not connected" }));
        return;
      }
      const jid = `${norm}@s.whatsapp.net`;
      const [result] = await sock.onWhatsApp(jid);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          exists: Boolean(result?.exists),
          jid: result?.jid || null,
        })
      );
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/send-message") {
    try {
      const body = await readJsonBody();
      const { to, text, candidates } = body;
      if (!text || (!to && !Array.isArray(candidates))) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Destination and text required" }));
        return;
      }
      if (!sock || !isConnected) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "WhatsApp non connecté. Scannez le QR Code." }));
        return;
      }

      const list =
        Array.isArray(candidates) && candidates.length > 0
          ? candidates
          : [{ phone: String(to).split("@")[0], type: "STUDENT_PRIMARY" }];

      const checkedNumbers = [];
      let winner = null;
      for (const c of list) {
        const norm = cleanPhoneDigits(c.phone);
        if (!norm) continue;
        const jid = `${norm}@s.whatsapp.net`;
        const [chk] = await sock.onWhatsApp(jid);
        const exists = Boolean(chk?.exists);
        checkedNumbers.push({ phone: norm, type: c.type || "PARENT_PHONE", hasWhatsApp: exists });
        if (exists) {
          winner = { phone: norm, jid: chk.jid || jid, type: c.type, name: c.name || null };
          break;
        }
      }

      if (!winner) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            noWhatsApp: true,
            checkedNumbers,
            error: "Aucun numéro WhatsApp actif trouvé",
          })
        );
        return;
      }

      const jitterMs = Math.floor(Math.random() * 800) + 400;
      await new Promise((r) => setTimeout(r, jitterMs));
      const sentMsg = await sock.sendMessage(winner.jid, { text });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          messageId: sentMsg?.key?.id,
          status: "SENT",
          recipientPhone: winner.phone,
          recipientType: winner.type,
          recipientName: winner.name,
          checkedNumbers,
        })
      );
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/disconnect") {
    await performDisconnectAndReset();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[WA Bridge] Port ${PORT} deja utilise. Lancez ARRETER_PONT_WA.bat d'abord.`);
    process.exit(1);
  }
  console.error("[WA Bridge] Server error:", err.message);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("==============================================================");
  console.log("  MASSINISSA SCHOOL — STANDALONE WHATSAPP BRIDGE (v2.0)");
  console.log(`  Local API      : http://127.0.0.1:${PORT}`);
  console.log(`  Cloud Sync URL : ${CLOUD_APP_URL}`);
  console.log("  Zero-Codebase  : Active (No DB credentials on this PC)");
  console.log("==============================================================");

  startSocket();

  // Continuous Cloud Sync loop (4s when pairing/busy, 6s when connected)
  setInterval(() => {
    syncWithCloud();
  }, 4500);

  // Hourly 24h Pre-Lesson Cron trigger (runs 20s after boot, then every 60 min)
  setTimeout(trigger24hCloudCron, 20000);
  setInterval(trigger24hCloudCron, 60 * 60 * 1000);
});
