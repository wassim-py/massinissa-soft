/**
 * Massinissa School — WhatsApp Bridge Gateway Daemon
 * Powered by @whiskeysockets/baileys Multi-Device Protocol
 *
 * Runs as a persistent companion daemon on Oracle Cloud (or local bridge).
 * Listens on port 5001 for internal REST and SSE streams.
 */

import http from "http";
import path from "path";
import fs from "fs";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto,
  WASocket,
} from "@whiskeysockets/baileys";
import prisma from "../src/lib/prisma";
const PORT = process.env.WHATSAPP_BRIDGE_PORT || 5001;
const API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), "data", "wa-session");

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock: WASocket | null = null;
let currentQrDataUrl: string | null = null;
let isConnected = false;
let connectedPhone: string | null = null;
let connectedName: string | null = null;

// Track active SSE connections for live QR streaming
const sseClients: http.ServerResponse[] = [];

function broadcastSseEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

async function updateDbStatus(connected: boolean, phone?: string | null, name?: string | null) {
  try {
    await prisma.whatsAppConfig.upsert({
      where: { id: "GLOBAL" },
      update: {
        isConnected: connected,
        connectedPhone: phone || null,
        connectedName: name || null,
        lastConnectedAt: connected ? new Date() : undefined,
        lastDisconnectedAt: !connected ? new Date() : undefined,
      },
      create: {
        id: "GLOBAL",
        isConnected: connected,
        connectedPhone: phone || null,
        connectedName: name || null,
        mode: "OFF",
      },
    });
  } catch (err) {
    console.error("[WA Bridge] Failed to update config in DB:", err);
  }
}

/**
 * Initializes the Baileys Multi-Device socket
 */
async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[WA Bridge] Using WhatsApp Web version v${version.join(".")} (Latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
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
        broadcastSseEvent("qr", { qr: currentQrDataUrl });
      } catch (err) {
        console.error("[WA Bridge] QR generation error:", err);
      }
    }

    if (connection === "close") {
      isConnected = false;
      connectedPhone = null;
      connectedName = null;
      currentQrDataUrl = null;
      await updateDbStatus(false);
      broadcastSseEvent("status", { isConnected: false });

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WA Bridge] Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(startSocket, 3000);
      } else {
        console.log("[WA Bridge] Logged out. Cleaning session files...");
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch {}
        setTimeout(startSocket, 3000);
      }
    } else if (connection === "open") {
      isConnected = true;
      currentQrDataUrl = null;
      const userJid = sock?.user?.id || "";
      connectedPhone = userJid.split(":")[0] || userJid.split("@")[0] || null;
      connectedName = sock?.user?.name || "Massinissa School";

      console.log(`[WA Bridge] Successfully connected as +${connectedPhone} (${connectedName})`);
      await updateDbStatus(true, connectedPhone, connectedName);
      broadcastSseEvent("status", {
        isConnected: true,
        phone: connectedPhone,
        name: connectedName,
      });
    }
  });

  // Listen for incoming parent messages to log them
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;
      const fromJid = msg.key.remoteJid;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
      if (fromJid && text) {
        console.log(`[WA Bridge] Incoming reply from ${fromJid}: "${text}"`);
        // If from student/parent, find most recent notification and record note
        const rawPhone = fromJid.split("@")[0];
        try {
          const recentNotif = await prisma.whatsAppNotification.findFirst({
            where: {
              recipientPhone: { contains: rawPhone },
              createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            },
            orderBy: { createdAt: "desc" },
          });

          if (recentNotif && recentNotif.lessonId) {
            // Append incoming message to attendance justification or notification log
            console.log(`[WA Bridge] Associated incoming message with Notification ${recentNotif.id}`);
          }
        } catch (e) {
          console.error("[WA Bridge] Error logging reply:", e);
        }
      }
    }
  });
}

// =================================================================
// INTERNAL HTTP REST SERVER
// =================================================================

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Key Protection
  const reqKey = req.headers["x-api-key"];
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (reqKey !== API_KEY && url.pathname !== "/api/session/qr-stream") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // 1. GET /api/session/status
  if (req.method === "GET" && url.pathname === "/api/session/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        isConnected,
        phone: connectedPhone,
        name: connectedName,
        qr: isConnected ? null : currentQrDataUrl,
      })
    );
    return;
  }

  // 2. GET /api/session/qr-stream (Server-Sent Events)
  if (req.method === "GET" && url.pathname === "/api/session/qr-stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    sseClients.push(res);

    // Initial state push
    res.write(
      `event: status\ndata: ${JSON.stringify({ isConnected, phone: connectedPhone, name: connectedName })}\n\n`
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

  // Helper to read JSON body
  const readJsonBody = async () => {
    return new Promise<any>((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
    });
  };

  // 3. POST /api/check-number
  if (req.method === "POST" && url.pathname === "/api/check-number") {
    try {
      const body = await readJsonBody();
      const phone = body.phone;
      if (!phone) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Phone number required" }));
        return;
      }

      if (!sock || !isConnected) {
        // Fallback: If not connected yet, assume valid format
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ exists: true, jid: `${phone}@s.whatsapp.net` }));
        return;
      }

      const jid = `${phone}@s.whatsapp.net`;
      const [result] = await sock.onWhatsApp(jid);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          exists: Boolean(result?.exists),
          jid: result?.jid || null,
        })
      );
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || "Internal check error" }));
    }
    return;
  }

  // 4. POST /api/send-message
  if (req.method === "POST" && url.pathname === "/api/send-message") {
    try {
      const body = await readJsonBody();
      const { to, text, notificationId } = body;

      if (!to || !text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Destination 'to' and 'text' required" }));
        return;
      }

      if (!sock || !isConnected) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "WhatsApp device is not connected. Scan QR first." }));
        return;
      }

      // Format JID
      const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

      // Token-bucket randomized jitter delay (400ms to 1200ms) to look natural
      const jitterMs = Math.floor(Math.random() * 800) + 400;
      await new Promise((r) => setTimeout(r, jitterMs));

      // Send message via Baileys
      const sentMsg = await sock.sendMessage(jid, { text });

      if (notificationId) {
        await prisma.whatsAppNotification.update({
          where: { id: notificationId },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          messageId: sentMsg?.key?.id,
          status: "SENT",
        })
      );
    } catch (err: any) {
      console.error("[WA Bridge] Send error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || "Failed to dispatch WhatsApp message" }));
    }
    return;
  }

  // 5. POST /api/session/disconnect
  if (req.method === "POST" && url.pathname === "/api/session/disconnect") {
    try {
      if (sock) {
        await sock.logout();
      }
      isConnected = false;
      connectedPhone = null;
      connectedName = null;
      currentQrDataUrl = null;
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch {}
      await updateDbStatus(false);
      broadcastSseEvent("status", { isConnected: false });

      setTimeout(startSocket, 2000);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Disconnected successfully" }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || "Failed to disconnect" }));
    }
    return;
  }

  // Default 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`[WA Bridge] WhatsApp daemon running on http://127.0.0.1:${PORT}`);
  startSocket();
});
