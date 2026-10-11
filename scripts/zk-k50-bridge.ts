/**
 * scripts/zk-k50-bridge.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Real-Time Hardware Bridge for ZKTeco K50 / ID PRO (TCP Port 4370)
 *
 * Zero external native dependencies — uses built-in Node.js `net` and `http`
 * to speak the ZKTeco TCP/IP Port 4370 binary protocol directly.
 *
 * FEATURES:
 *   1. Connects to ZKTeco K50/ID PRO over TCP (default 192.168.1.201:4370).
 *   2. Subscribes to real-time hardware events (EF_ATTLOG & EF_VERIFY):
 *      - Recognized finger/card -> forwards globalNumber to /api/biometrics/scan
 *      - Unrecognized finger    -> forwards isUnrecognizedFinger=true (State 4)
 *   3. Exposes local enrollment listener on http://127.0.0.1:4375/enroll
 *      so clicking "Enregistrer l'empreinte" in StudentForm triggers CMD_STARTENROLL
 *      directly on the K50!
 *   4. Auto-reconnects every 5s if cable or power is unplugged.
 *
 * USAGE:
 *   npx tsx scripts/zk-k50-bridge.ts
 *   npx tsx scripts/zk-k50-bridge.ts --ip 192.168.1.201 --branch 1 --app http://localhost:3000
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as net from "net";
import * as http from "http";

// Parse CLI / ENV configuration
function getArg(flag: string, envKey: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (process.env[envKey]) return process.env[envKey]!;
  return fallback;
}

const DEVICE_IP = getArg("--ip", "ZK_DEVICE_IP", "192.168.50.201");
const DEVICE_PORT = Number(getArg("--port", "ZK_DEVICE_PORT", "4370"));
const BRANCH_ID = Number(getArg("--branch", "ZK_BRANCH_ID", "1"));
const APP_URL = getArg("--app", "NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/$/, "");
const LOCAL_CONTROL_PORT = Number(getArg("--control-port", "ZK_CONTROL_PORT", "4375"));
const COMM_KEY = Number(getArg("--key", "ZK_COMM_KEY", "0"));

// ZKTeco Protocol Constants
const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const CMD_CONNECT = 1000;
const CMD_EXIT = 1001;
const CMD_ENABLEDEVICE = 1002;
const CMD_AUTH = 1102;
const CMD_ACK_OK = 2000;
const CMD_ACK_UNAUTH = 2005;
const CMD_REG_EVENT = 500;
const CMD_STARTENROLL = 61;
const CMD_CANCELCAPTURE = 62;

// Real-time event flags
const EF_ATTLOG = 1;
const EF_FINGER = 2;
const EF_ENROLLUSER = 4;
const EF_ENROLLFINGER = 8;
const EF_VERIFY = 256;
const EVENT_MASK = EF_ATTLOG | EF_VERIFY | EF_FINGER | EF_ENROLLUSER | EF_ENROLLFINGER;

let sessionId = 0;
let replyId = 0;
let socket: net.Socket | null = null;
let isConnected = false;

/**
 * Generates the 4-byte ZKTeco CMD_AUTH (1102) session key payload
 */
function makeCommKey(key: number, sId: number, ticks: number = 50): Buffer {
  let k = 0;
  for (let i = 0; i < 32; i++) {
    if (key & (1 << i)) {
      k = (k << 1) | 1;
    } else {
      k = k << 1;
    }
  }
  k = (k + sId) >>> 0;
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(k, 0);
  buf[0] ^= 0x5a;
  buf[1] ^= 0x4b;
  buf[2] ^= 0x53;
  buf[3] ^= 0x4f;
  const h0 = buf.readUInt16LE(0);
  const h1 = buf.readUInt16LE(2);
  buf.writeUInt16LE(h1, 0);
  buf.writeUInt16LE(h0, 2);
  const b = ticks & 0xff;
  buf[0] ^= b;
  buf[1] ^= b;
  buf[2] = b;
  buf[3] ^= b;
  return buf;
}

/**
 * Computes ZKTeco 16-bit 1's complement checksum
 */
function createChecksum(buf: Buffer): number {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === 2) continue; // skip checksum field itself
    if (i + 1 < buf.length) {
      chksum += buf.readUInt16LE(i);
    } else {
      chksum += buf[i];
    }
    if (chksum > 0xffff) {
      chksum = (chksum & 0xffff) + (chksum >> 16);
    }
  }
  return (~chksum) & 0xffff;
}

/**
 * Builds a complete ZKTeco TCP packet (8-byte TCP header + 8-byte ZK header + payload)
 */
function buildZkTcpPacket(
  command: number,
  sId: number,
  rId: number,
  data: Buffer = Buffer.alloc(0)
): Buffer {
  const zkPacket = Buffer.alloc(8 + data.length);
  zkPacket.writeUInt16LE(command, 0);
  zkPacket.writeUInt16LE(0, 2);
  zkPacket.writeUInt16LE(sId, 4);
  zkPacket.writeUInt16LE(rId, 6);
  if (data.length > 0) {
    data.copy(zkPacket, 8);
  }
  const chksum = createChecksum(zkPacket);
  zkPacket.writeUInt16LE(chksum, 2);

  const tcpWrapper = Buffer.alloc(8 + zkPacket.length);
  TCP_MAGIC.copy(tcpWrapper, 0);
  tcpWrapper.writeUInt32LE(zkPacket.length, 4);
  zkPacket.copy(tcpWrapper, 8);
  return tcpWrapper;
}

/**
 * Forwards scan event to the Next.js application (/api/biometrics/scan)
 */
async function forwardScanToApp(payload: {
  globalNumber?: number | null;
  isUnrecognizedFinger?: boolean;
}) {
  try {
    const res = await fetch(`${APP_URL}/api/biometrics/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: BRANCH_ID,
        deviceIp: DEVICE_IP,
        devicePort: DEVICE_PORT,
        globalNumber: payload.globalNumber ?? null,
        isUnrecognizedFinger: Boolean(payload.isUnrecognizedFinger),
        scanTime: new Date().toISOString(),
      }),
    });
    const data = await res.json();
    if (data.success && data.scan) {
      const s = data.scan;
      console.log(
        `[K50 -> APP] Status: ${s.status} | Student: ${s.studentName || "Unknown"} (#${
          s.globalNumber || "?"
        }) | Group: ${s.className || "—"} | Credits: ${s.remainingCredits ?? "—"}`
      );
    }
  } catch (err: any) {
    console.error(`[K50 Bridge] Failed to reach Next.js app at ${APP_URL}:`, err?.message);
  }
}

/**
 * Parses real-time event payload from ZKTeco K50 (EF_ATTLOG / EF_VERIFY)
 */
function handleRealTimeEvent(eventType: number, payload: Buffer) {
  if (eventType === EF_ATTLOG) {
    // Parse userId string from K50 real-time attendance packet
    // K50 uses either 24-byte userId (32-bit/TFT) or 9-byte userId
    let userIdStr = "";
    if (payload.length >= 32) {
      userIdStr = payload.subarray(0, 24).toString("ascii").replace(/\0.*$/g, "").trim();
    } else if (payload.length >= 16) {
      userIdStr = payload.subarray(0, 9).toString("ascii").replace(/\0.*$/g, "").trim();
    }

    const globalNumber = parseInt(userIdStr, 10);
    if (!isNaN(globalNumber) && globalNumber > 0) {
      console.log(`[K50 Hardware] Finger Recognized -> User ID #${globalNumber}`);
      forwardScanToApp({ globalNumber });
    } else {
      console.log(`[K50 Hardware] Unrecognized scan payload`);
      forwardScanToApp({ isUnrecognizedFinger: true });
    }
  } else if (eventType === EF_VERIFY) {
    // If payload is 4 bytes with -1 (0xFFFFFFFF), finger was NOT recognized by K50
    if (payload.length >= 4) {
      const uid = payload.readInt32LE(0);
      if (uid < 0 || uid === 0xffffffff) {
        console.log(`[K50 Hardware] Finger NOT Recognized (EF_VERIFY failed)`);
        forwardScanToApp({ isUnrecognizedFinger: true });
      }
    }
  }
}

/**
 * Connects to the ZKTeco K50 over TCP Port 4370 and registers real-time events
 */
function connectToK50() {
  if (socket) {
    socket.destroy();
    socket = null;
  }

  console.log(`[K50 Bridge] Connecting to ZKTeco K50 at ${DEVICE_IP}:${DEVICE_PORT} (Branch #${BRANCH_ID})...`);
  socket = new net.Socket();

  socket.connect(DEVICE_PORT, DEVICE_IP, () => {
    isConnected = false;
    sessionId = 0;
    replyId = 0;
    console.log(`[K50 Bridge] ✓ TCP Connected to ${DEVICE_IP}:${DEVICE_PORT}. Sending CMD_CONNECT...`);
    const pkt = buildZkTcpPacket(CMD_CONNECT, 0, replyId);
    socket?.write(pkt);
  });

  socket.on("data", (chunk: Buffer) => {
    if (chunk.length < 16) return;
    const cmd = chunk.readUInt16LE(8);
    const sId = chunk.readUInt16LE(12);
    const rId = chunk.readUInt16LE(14);
    const payload = chunk.subarray(16);

    if (cmd === CMD_ACK_UNAUTH) {
      sessionId = sId;
      replyId = (rId + 1) & 0xffff;
      socket?.write(buildZkTcpPacket(CMD_AUTH, sessionId, replyId, makeCommKey(COMM_KEY, sessionId)));
    } else if (cmd === CMD_ACK_OK && !isConnected) {
      isConnected = true;
      if (sId !== 0 && sessionId === 0) sessionId = sId;
      replyId = (rId + 1) & 0xffff;
      console.log(`[K50 Bridge] ✓ Handshake & Auth OK (Session ID: ${sessionId}). Subscribing to real-time scans...`);

      // Register real-time events (CMD_REG_EVENT)
      const maskBuf = Buffer.alloc(4);
      maskBuf.writeUInt32LE(EVENT_MASK, 0);
      socket?.write(buildZkTcpPacket(CMD_REG_EVENT, sessionId, replyId, maskBuf));
    } else if (cmd === CMD_REG_EVENT) {
      // Real-time event from K50! sId contains the event type (EF_ATTLOG, EF_VERIFY, etc.)
      const eventType = sId;
      // Send ACK back to K50 immediately so its screen/sensor stays responsive
      socket?.write(buildZkTcpPacket(CMD_ACK_OK, sessionId, rId));
      handleRealTimeEvent(eventType, payload);
    }
  });

  socket.on("error", (err) => {
    isConnected = false;
    sessionId = 0;
    console.warn(`[K50 Bridge] Connection warning (${DEVICE_IP}:${DEVICE_PORT}): ${err.message}`);
  });

  socket.on("close", () => {
    isConnected = false;
    sessionId = 0;
    console.log(`[K50 Bridge] Disconnected from K50. Reconnecting in 5 seconds...`);
    setTimeout(connectToK50, 5000);
  });
}

/**
 * Triggers remote fingerprint enrollment on the K50 for a student's globalNumber
 */
function triggerK50Enrollment(globalNumber: number, fingerIndex: number = 0): boolean {
  if (!socket || !isConnected || sessionId === 0) {
    return false;
  }
  replyId = (replyId + 1) & 0xffff;
  socket.write(buildZkTcpPacket(CMD_CANCELCAPTURE, sessionId, replyId));

  // Build 26-byte CMD_STARTENROLL payload (24-byte ASCII userId + 1-byte fingerIndex + 1-byte flag)
  const enrollData = Buffer.alloc(26, 0);
  enrollData.write(String(globalNumber), 0, 24, "ascii");
  enrollData.writeUInt8(fingerIndex, 24);
  enrollData.writeUInt8(1, 25); // overwrite flag

  replyId = (replyId + 1) & 0xffff;
  socket.write(buildZkTcpPacket(CMD_STARTENROLL, sessionId, replyId, enrollData));
  console.log(`[K50 Bridge] -> Triggered CMD_STARTENROLL on K50 for Student #${globalNumber} (Finger ${fingerIndex})`);
  return true;
}

// Local HTTP Control Server (Port 4375) for Browser -> K50 Enrollment Trigger
const controlServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connected: isConnected,
        deviceIp: DEVICE_IP,
        devicePort: DEVICE_PORT,
        branchId: BRANCH_ID,
      })
    );
    return;
  }

  if (req.method === "POST" && req.url === "/enroll") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const globalNumber = Number(parsed.globalNumber || 0);
        const fingerIndex = Number(parsed.fingerIndex || 0);
        const triggered = triggerK50Enrollment(globalNumber, fingerIndex);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, hardwareTriggered: triggered }));
      } catch (e: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e?.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

controlServer.listen(LOCAL_CONTROL_PORT, "127.0.0.1", () => {
  console.log(`═══════════════════════════════════════════════════════════════════════`);
  console.log(` 🫆 Massinissa School — ZKTeco K50/ID PRO Live Bridge Started`);
  console.log(` • Target K50 Device : ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log(` • Branch ID         : #${BRANCH_ID}`);
  console.log(` • Web App Endpoint  : ${APP_URL}/api/biometrics/scan`);
  console.log(` • Local Enroll API  : http://127.0.0.1:${LOCAL_CONTROL_PORT}/enroll`);
  console.log(`═══════════════════════════════════════════════════════════════════════`);
  connectToK50();
});
