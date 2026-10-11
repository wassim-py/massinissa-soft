/**
 * ============================================================================
 * MASSINISSA ACADEMY — PONT LOCAL BIOMÉTRIQUE ZKTECO K50 PRO (zk-bridge.js)
 * ============================================================================
 * Ce service ultra-léger (0 dépendance externe, Node.js pur) tourne sur le PC
 * de chaque annexe (ECOLE, ANNEX, AMPHI) et relie :
 *   1. Le(s) lecteur(s) physique(s) ZKTeco K50 Pro branché(s) par câble RJ45
 *      (ex: 192.168.50.201:4370, 192.168.50.202:4370)
 *   2. L'application Massinissa Academy déployée en ligne (Cloud HTTPS)
 *      via un serveur local sur http://127.0.0.1:4375 compatible CORS & PNA.
 * ============================================================================
 */

const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const BRIDGE_PORT = Number(process.env.ZK_BRIDGE_PORT || 4375);
const DEVICE_PORT = Number(process.env.ZK_DEVICE_PORT || 4370);
const COMM_KEY = Number(process.env.ZK_COMM_KEY || 0);

const CONFIGURED_IPS = (
  process.env.ZK_DEVICE_IP ||
  process.argv.find((a) => a.startsWith("--ips="))?.slice(6) ||
  "192.168.50.201"
)
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

// ZKTeco Protocol Constants
const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const CMD_USER_WRQ = 8;
const CMD_DELETE_USER = 18;
const CMD_DELETE_USERTEMP = 19;
const CMD_STARTVERIFY = 60;
const CMD_STARTENROLL = 61;
const CMD_CANCELCAPTURE = 62;
const CMD_REG_EVENT = 500;
const CMD_CONNECT = 1000;
const CMD_ENABLEDEVICE = 1002;
const CMD_REFRESHDATA = 1013;
const CMD_AUTH = 1102;
const CMD_ACK_OK = 2000;
const CMD_ACK_UNAUTH = 2005;

// Real-Time Event Flags
const EF_ATTLOG = 1;
const EF_FINGER = 2;
const EF_ENROLLUSER = 4;
const EF_ENROLLFINGER = 8;
const EF_BUTTON = 16;
const EF_VERIFY = 256;
const EF_FPFTR = 512;
const EF_ALARM = 1024;
const EVENT_MASK = 0x0000ffff;

const state = {
  appUrl: process.env.CLOUD_APP_URL || "",
  branchId: Number(process.env.BRANCH_ID || 1),
  openLessonId: null,
  lastCloudHeartbeatAt: 0,
  lastAttLogAt: 0,
  lastUnrecognizedAt: 0,
  verifyFailTimer: null,
  pendingScans: [],
  enrollment: {
    active: false,
    globalNumber: 0,
    studentId: null,
    studentName: "",
    fingerIndex: 0,
    step: 0,
    status: "IDLE",
    message: "",
    startedAt: 0,
    updatedAt: Date.now(),
  },
};

// Map of connected K50 Pro sockets by IP
const devices = new Map();

function createChecksum(buf) {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === 2) continue;
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

function buildZkTcpPacket(command, sId, rId, data = Buffer.alloc(0)) {
  const zkPacket = Buffer.alloc(8 + data.length);
  zkPacket.writeUInt16LE(command, 0);
  zkPacket.writeUInt16LE(0, 2);
  zkPacket.writeUInt16LE(sId & 0xffff, 4);
  zkPacket.writeUInt16LE(rId & 0xffff, 6);
  if (data.length > 0) {
    data.copy(zkPacket, 8);
  }
  zkPacket.writeUInt16LE(createChecksum(zkPacket), 2);

  const tcpWrapper = Buffer.alloc(8 + zkPacket.length);
  TCP_MAGIC.copy(tcpWrapper, 0);
  tcpWrapper.writeUInt32LE(zkPacket.length, 4);
  zkPacket.copy(tcpWrapper, 8);
  return tcpWrapper;
}

function makeCommKey(key, sessionId, ticks = 50) {
  let k = 0;
  for (let i = 0; i < 32; i++) {
    if (key & (1 << i)) {
      k = (k << 1) | 1;
    } else {
      k = k << 1;
    }
  }
  k = (k + sessionId) >>> 0;

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

function toAsciiName(name, globalNumber) {
  const cleaned = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  if (!cleaned) return `Student #${globalNumber}`;
  return cleaned.slice(0, 23);
}

function buildUser72Packet(uid, name, userId) {
  const buf = Buffer.alloc(72, 0);
  buf.writeUInt16LE(uid & 0xffff, 0);
  buf.writeUInt8(0, 2);
  buf.write(toAsciiName(name, uid), 11, 24, "ascii");
  buf.writeUInt32LE(0, 35);
  buf.writeUInt8(0, 39);
  buf.write("1", 40, 7, "ascii");
  buf.writeUInt8(0, 47);
  buf.write(String(userId).slice(0, 23), 48, 24, "ascii");
  return buf;
}

function sendToDevice(dev, cmd, data = Buffer.alloc(0)) {
  if (!dev || !dev.socket || dev.socket.destroyed) return false;
  dev.replyId = (dev.replyId + 1) & 0xffff;
  const pkt = buildZkTcpPacket(cmd, dev.sessionId, dev.replyId, data);
  dev.socket.write(pkt);
  return true;
}

function sendToAllDevices(cmd, data = Buffer.alloc(0)) {
  let sent = false;
  for (const dev of devices.values()) {
    if (dev.isConnected && sendToDevice(dev, cmd, data)) {
      sent = true;
    }
  }
  return sent;
}

function isAnyDeviceConnected() {
  for (const dev of devices.values()) {
    if (dev.isConnected && dev.socket && !dev.socket.destroyed) return true;
  }
  return false;
}

function deleteHardwareUserOnAllDevices(globalNumber) {
  const delTempBuf = Buffer.alloc(25, 0);
  delTempBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
  delTempBuf.writeUInt8(0, 24);
  sendToAllDevices(CMD_DELETE_USERTEMP, delTempBuf);

  const delBuf = Buffer.alloc(2);
  delBuf.writeUInt16LE(globalNumber & 0xffff, 0);
  sendToAllDevices(CMD_DELETE_USER, delBuf);
  sendToAllDevices(CMD_REFRESHDATA);
  console.log(
    `[Pont K50 Pro] Utilisateur #${globalNumber} supprime de la memoire flash du lecteur K50 Pro.`
  );
}

/**
 * Posts JSON to the online Cloud App (/api/biometrics/scan)
 */
function postToCloud(path, payload) {
  return new Promise((resolve) => {
    if (!state.appUrl) {
      return resolve(null);
    }
    try {
      const targetUrl = new URL(path, state.appUrl);
      const bodyStr = JSON.stringify(payload);
      const client = targetUrl.protocol === "https:" ? https : http;

      const req = client.request(
        targetUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
          },
          timeout: 6000,
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(raw));
            } catch {
              resolve(null);
            }
          });
        }
      );

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.write(bodyStr);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

async function dispatchScanToCloud(scanPayload) {
  const fullPayload = {
    branchId: state.branchId,
    openLessonId: state.openLessonId,
    ...scanPayload,
  };

  if (state.appUrl) {
    const cloudRes = await postToCloud("/api/biometrics/scan", fullPayload);
    if (cloudRes && cloudRes.success) {
      if (
        cloudRes.scan?.status === "UNRECOGNIZED" &&
        scanPayload.globalNumber > 0
      ) {
        deleteHardwareUserOnAllDevices(scanPayload.globalNumber);
      }
      return;
    }
  }

  // Fallback: queue scan for the browser's BiometricMonitorProvider (which polls 127.0.0.1:4375/status)
  state.pendingScans.push(scanPayload);
  if (state.pendingScans.length > 25) {
    state.pendingScans.shift();
  }
}

function scheduleUnrecognizedFingerCheck(delayMs = 450) {
  if (state.verifyFailTimer) clearTimeout(state.verifyFailTimer);
  state.verifyFailTimer = setTimeout(() => {
    state.verifyFailTimer = null;
    const now = Date.now();
    if (
      now - state.lastAttLogAt < 900 ||
      now - state.lastUnrecognizedAt < 1500 ||
      state.enrollment.active
    ) {
      return;
    }
    state.lastUnrecognizedAt = now;
    console.log(
      `[Pont K50 Pro] ✗ Empreinte non reconnue ("Try again") -> Envoi Etat 4`
    );
    dispatchScanToCloud({ isUnrecognizedFinger: true });
  }, delayMs);
}

function handleRealTimeEvent(dev, eventType, payload) {
  // 1. Enrollment mode (3 finger taps)
  if (state.enrollment.active) {
    if (
      eventType === EF_VERIFY ||
      eventType === EF_FPFTR ||
      eventType === EF_FINGER ||
      eventType === EF_BUTTON ||
      eventType === EF_ALARM
    ) {
      const score = payload.length >= 1 ? payload.readUInt8(0) : 100;
      if (score > 0 || eventType !== EF_FPFTR) {
        state.enrollment.step = Math.min(3, state.enrollment.step + 1);
        state.enrollment.updatedAt = Date.now();
        console.log(
          `[Pont K50 Enroll] Eleve #${state.enrollment.globalNumber} -> Pression ${state.enrollment.step}/3`
        );
      }
      return;
    }

    if (eventType === EF_ENROLLFINGER || eventType === EF_ENROLLUSER) {
      const enrollRes = payload.length >= 2 ? payload.readUInt16LE(0) : 0;
      const enrolledNum = state.enrollment.globalNumber;

      sendToDevice(dev, CMD_REFRESHDATA);
      sendToDevice(dev, CMD_STARTVERIFY);
      sendToDevice(dev, CMD_ENABLEDEVICE);

      if (enrollRes === 0) {
        state.enrollment.step = 3;
        state.enrollment.active = false;
        state.enrollment.status = "SUCCESS";
        state.enrollment.message = `Empreinte enregistree sur le K50 Pro (#${enrolledNum}) !`;
        state.enrollment.updatedAt = Date.now();
        console.log(`[Pont K50 Enroll] ✓ SUCCES pour Eleve #${enrolledNum}`);
      } else {
        state.enrollment.active = false;
        state.enrollment.status = "FAILED";
        state.enrollment.message =
          "Echec de lecture sur le K50 Pro (doigt deja utilise ou mal pose). Reessayez.";
        state.enrollment.updatedAt = Date.now();
        console.warn(
          `[Pont K50 Enroll] ✗ ECHEC (code=${enrollRes}) pour #${enrolledNum}`
        );
      }
      return;
    }
    return;
  }

  // 2. Normal Attendance Mode
  if (eventType === EF_ATTLOG) {
    state.lastAttLogAt = Date.now();
    if (state.verifyFailTimer) {
      clearTimeout(state.verifyFailTimer);
      state.verifyFailTimer = null;
    }

    let userIdStr = "";
    if (payload.length >= 32) {
      userIdStr = payload
        .subarray(0, 24)
        .toString("ascii")
        .replace(/\0.*$/g, "")
        .trim();
    } else if (payload.length >= 16) {
      userIdStr = payload
        .subarray(0, 9)
        .toString("ascii")
        .replace(/\0.*$/g, "")
        .trim();
    }

    const globalNumber = parseInt(userIdStr, 10);
    if (!isNaN(globalNumber) && globalNumber > 0) {
      console.log(
        `[Pont K50 Pro] ✓ Empreinte reconnue -> Eleve #${globalNumber} (Annexe=${state.branchId})`
      );
      dispatchScanToCloud({ globalNumber });
    } else {
      dispatchScanToCloud({ isUnrecognizedFinger: true });
    }
    return;
  }

  if (
    eventType === EF_ALARM ||
    eventType === EF_FPFTR ||
    eventType === EF_FINGER ||
    eventType === EF_VERIFY
  ) {
    const delayMs = eventType === EF_ALARM ? 150 : 450;
    scheduleUnrecognizedFingerCheck(delayMs);
  }
}

function connectDevice(ip) {
  let dev = devices.get(ip);
  if (!dev) {
    dev = {
      ip,
      socket: null,
      rxBuffer: Buffer.alloc(0),
      sessionId: 0,
      replyId: 0,
      isConnected: false,
      isConnecting: false,
    };
    devices.set(ip, dev);
  }

  if (
    (dev.isConnected && dev.socket && !dev.socket.destroyed) ||
    dev.isConnecting
  ) {
    return;
  }

  dev.isConnecting = true;
  const sock = new net.Socket();
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 10000);
  dev.socket = sock;
  dev.rxBuffer = Buffer.alloc(0);

  sock.connect(DEVICE_PORT, ip, () => {
    dev.sessionId = 0;
    dev.replyId = 0;
    sock.write(buildZkTcpPacket(CMD_CONNECT, 0, 0));
  });

  sock.on("data", (chunk) => {
    dev.rxBuffer = Buffer.concat([dev.rxBuffer, Buffer.from(chunk)]);
    while (dev.rxBuffer.length >= 16) {
      const magicIdx = dev.rxBuffer.indexOf(TCP_MAGIC);
      if (magicIdx === -1) {
        dev.rxBuffer = Buffer.alloc(0);
        return;
      }
      if (magicIdx > 0) dev.rxBuffer = dev.rxBuffer.subarray(magicIdx);
      if (dev.rxBuffer.length < 16) return;

      const zkLen = dev.rxBuffer.readUInt32LE(4);
      const totalLen = 8 + zkLen;
      if (dev.rxBuffer.length < totalLen) return;

      const frame = dev.rxBuffer.subarray(0, totalLen);
      dev.rxBuffer = dev.rxBuffer.subarray(totalLen);

      const cmd = frame.readUInt16LE(8);
      const sId = frame.readUInt16LE(12);
      const rId = frame.readUInt16LE(14);
      const payload = frame.subarray(16);

      if (cmd === CMD_ACK_UNAUTH) {
        dev.sessionId = sId;
        dev.replyId = rId;
        sendToDevice(dev, CMD_AUTH, makeCommKey(COMM_KEY, dev.sessionId));
      } else if (cmd === CMD_ACK_OK && !dev.isConnected) {
        if (sId !== 0 && dev.sessionId === 0) dev.sessionId = sId;
        dev.isConnected = true;
        dev.isConnecting = false;
        console.log(
          `[Pont K50 Pro] ✓ Connecte au lecteur ZKTeco K50 Pro (${ip}:${DEVICE_PORT})`
        );
        const maskBuf = Buffer.alloc(4);
        maskBuf.writeUInt32LE(EVENT_MASK, 0);
        sendToDevice(dev, CMD_REG_EVENT, maskBuf);
        sendToDevice(dev, CMD_ENABLEDEVICE);
        sendToDevice(dev, CMD_STARTVERIFY);
      } else if (cmd === CMD_REG_EVENT) {
        if (dev.socket && !dev.socket.destroyed) {
          dev.socket.write(buildZkTcpPacket(CMD_ACK_OK, dev.sessionId, 0));
        }
        handleRealTimeEvent(dev, sId, payload);
      }
    }
  });

  sock.on("error", () => {
    dev.isConnected = false;
    dev.isConnecting = false;
  });

  sock.on("close", () => {
    if (dev.isConnected) {
      console.log(
        `[Pont K50 Pro] ! Deconnecte de ${ip}:${DEVICE_PORT}. Reconnexion auto...`
      );
    }
    dev.isConnected = false;
    dev.isConnecting = false;
  });
}

// Reconnection loop every 3 seconds
setInterval(() => {
  for (const ip of CONFIGURED_IPS) {
    connectDevice(ip);
  }
}, 3000);
for (const ip of CONFIGURED_IPS) {
  connectDevice(ip);
}

// Local HTTP Server on 127.0.0.1:4375 for browser communication
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Access-Control-Request-Private-Network"
  );
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${BRIDGE_PORT}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "GET" && pathname === "/status") {
    const appUrlParam = parsedUrl.searchParams.get("appUrl");
    const branchIdParam = Number(parsedUrl.searchParams.get("branchId") || 0);
    const openLessonParam = Number(
      parsedUrl.searchParams.get("openLessonId") || 0
    );

    if (appUrlParam && appUrlParam.startsWith("http")) {
      state.appUrl = appUrlParam;
    }
    if (branchIdParam > 0) {
      state.branchId = branchIdParam;
    }
    state.openLessonId = openLessonParam > 0 ? openLessonParam : null;

    const connected = isAnyDeviceConnected();

    // Send cloud heartbeat every 20 seconds when connected
    if (
      connected &&
      state.appUrl &&
      Date.now() - state.lastCloudHeartbeatAt > 20000
    ) {
      state.lastCloudHeartbeatAt = Date.now();
      postToCloud("/api/biometrics/scan", {
        branchId: state.branchId,
        heartbeatOnly: true,
      });
    }

    const drainedScans = state.pendingScans.splice(0, state.pendingScans.length);
    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        connected,
        deviceIp: CONFIGURED_IPS.join(","),
        branchId: state.branchId,
        pendingScans: drainedScans,
      })
    );
    return;
  }

  if (req.method === "GET" && pathname === "/enroll") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        connected: isAnyDeviceConnected(),
        enrollment: state.enrollment,
      })
    );
    return;
  }

  if (req.method === "POST" && pathname === "/enroll") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        const globalNumber = Number(data.globalNumber || 1);
        const fingerIndex = Number(data.fingerIndex || 0);
        const studentName = data.studentName || `Student #${globalNumber}`;

        if (!isAnyDeviceConnected()) {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              success: false,
              message: `Impossible de joindre le lecteur K50 Pro (${CONFIGURED_IPS.join(", ")}). Verifiez le cable Ethernet.`,
            })
          );
          return;
        }

        sendToAllDevices(CMD_CANCELCAPTURE);
        const userPkt = buildUser72Packet(
          globalNumber,
          studentName,
          String(globalNumber)
        );
        sendToAllDevices(CMD_USER_WRQ, userPkt);

        const delTempBuf = Buffer.alloc(25, 0);
        delTempBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
        delTempBuf.writeUInt8(fingerIndex, 24);
        sendToAllDevices(CMD_DELETE_USERTEMP, delTempBuf);

        const enrollBuf = Buffer.alloc(26, 0);
        enrollBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
        enrollBuf.writeUInt8(fingerIndex, 24);
        enrollBuf.writeUInt8(1, 25);
        sendToAllDevices(CMD_STARTENROLL, enrollBuf);

        state.enrollment = {
          active: true,
          globalNumber,
          studentId: data.studentId || null,
          studentName,
          fingerIndex,
          step: 0,
          status: "WAITING_FINGER",
          message: `Posez le doigt 3 fois sur le lecteur K50 Pro (ID #${globalNumber})...`,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        };

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            globalNumber,
            enrollment: state.enrollment,
          })
        );
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  if (req.method === "DELETE" && pathname === "/enroll") {
    const mode = parsedUrl.searchParams.get("mode") || "cancel";
    const globalNumber = Number(parsedUrl.searchParams.get("globalNumber") || 0);

    if (mode === "delete" && globalNumber > 0) {
      deleteHardwareUserOnAllDevices(globalNumber);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    state.enrollment.active = false;
    state.enrollment.status = "CANCELLED";
    state.enrollment.updatedAt = Date.now();
    sendToAllDevices(CMD_CANCELCAPTURE);
    sendToAllDevices(CMD_STARTVERIFY);
    sendToAllDevices(CMD_ENABLEDEVICE);

    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ success: false, message: "Not Found" }));
});

server.listen(BRIDGE_PORT, "127.0.0.1", () => {
  console.log("==============================================================");
  console.log("  PONT BIOMETRIQUE MASSINISSA ACADEMY (ZKTeco K50 Pro)");
  console.log(`  Serveur Local Actif : http://127.0.0.1:${BRIDGE_PORT}`);
  console.log(`  Lecteur(s) K50 Pro  : ${CONFIGURED_IPS.join(", ")}:${DEVICE_PORT}`);
  console.log("==============================================================");
});
