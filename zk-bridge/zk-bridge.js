/**
 * ============================================================================
 * MASSINISSA ACADEMY — SELF-HEALING LOCAL BRIDGE FOR ZKTECO K50 PRO (v4)
 * ============================================================================
 * Features:
 *   1. Active 8-second ZKTeco Protocol Heartbeat (CMD_REG_EVENT + CMD_ENABLEDEVICE)
 *      -> Prevents K50 Pro session idle timeout & Realtek Ethernet sleep!
 *   2. 12-second Zombie Socket Killer (lastRxAt verification)
 *      -> Immediately detects unplugged cable or restarted K50 Pro device!
 *   3. Strict 2.0-second Connect & Handshake Timeout
 *      -> Prevents Windows from hanging in SYN_SENT on Wi-Fi when unplugged!
 *   4. Instant 0ms Server-Sent Events (SSE) on http://127.0.0.1:4375/events
 *   5. Multi-Branch Cloud Biometric Template Synchronizer:
 *      - Auto-extracts biometric template (CMD_USERTEMP_RRQ) on enrollment & pushes to Cloud DB
 *      - Auto-downloads templates (CMD_USER_WRQ + CMD_TMP_WRITE) from Cloud DB to local K50
 *      - One-click on-demand sync via http://127.0.0.1:4375/sync
 *      - Auto-sync on startup and periodic 5-minute background synchronization
 * ============================================================================
 */

const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");

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
const CMD_USERTEMP_RRQ = 9;
const CMD_USERTEMP_WRQ = 10;
const CMD_DELETE_USER = 18;
const CMD_DELETE_USERTEMP = 19;
const CMD_STARTVERIFY = 60;
const CMD_STARTENROLL = 61;
const CMD_CANCELCAPTURE = 62;
const CMD_TMP_WRITE = 87;
const CMD_CHECKSUM_BUFFER = 119;
const CMD_GET_TIME = 201;
const CMD_REG_EVENT = 500;
const CMD_CONNECT = 1000;
const CMD_ENABLEDEVICE = 1002;
const CMD_REFRESHDATA = 1013;
const CMD_AUTH = 1102;
const CMD_PREPARE_DATA = 1500;
const CMD_DATA = 1501;
const CMD_FREE_DATA = 1502;
const CMD_ACK_OK = 2000;
const CMD_ACK_ERROR = 2001;
const CMD_ACK_DATA = 2002;
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

// Timing Constants for Self-Healing Connection
const CONNECT_TIMEOUT_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 8000;
const ZOMBIE_TIMEOUT_MS = 14000;
const RECONNECT_LOOP_MS = 2500;
const SYNC_CACHE_FILE = path.join(__dirname, "synced_templates.json");
const BRIDGE_CONFIG_FILE = path.join(__dirname, "bridge_config.json");

function loadBridgeConfig() {
  try {
    if (fs.existsSync(BRIDGE_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(BRIDGE_CONFIG_FILE, "utf8")) || {};
    }
  } catch {}
  return {};
}

function saveBridgeConfig(partial) {
  try {
    const current = loadBridgeConfig();
    const updated = { ...current, ...partial, updatedAt: new Date().toISOString() };
    fs.writeFileSync(BRIDGE_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf8");
  } catch {}
}

const persistedConfig = loadBridgeConfig();

const state = {
  appUrl: process.env.CLOUD_APP_URL || persistedConfig.appUrl || "",
  branchId: Number(process.env.BRANCH_ID || persistedConfig.branchId || 1),
  openLessonId: null,
  lastAttLogAt: 0,
  lastUnrecognizedAt: 0,
  verifyFailTimer: null,
  pendingScans: [],
  hasInitialSynced: false,
  isSyncing: false,
  enrollment: {
    active: false,
    enrollingDeviceIp: null,
    globalNumber: 0,
    studentId: null,
    studentName: "",
    fingerIndex: 0,
    templateData: null,
    step: 0,
    status: "IDLE",
    message: "",
    startedAt: 0,
    updatedAt: Date.now(),
  },
};

// Map of connected K50 Pro sockets by IP
const devices = new Map();

// Active browser Server-Sent Events (SSE) clients for 0ms instant scan push
const sseClients = new Set();

function broadcastSse(eventObj) {
  const payload = `data: ${JSON.stringify(eventObj)}\n\n`;
  let delivered = false;
  for (const res of sseClients) {
    try {
      res.write(payload);
      delivered = true;
    } catch {
      sseClients.delete(res);
    }
  }
  return delivered;
}

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

/**
 * Translates/formats student names into clean, readable Latin ASCII (max 23 chars)
 * for display on ZKTeco K50 TFT LCD screens.
 * - Preserves Latin/French names and cleans accents.
 * - Accurately transliterates Algerian Arabic names and prefixes phonetically.
 * - Prevents the device from displaying "Student #..." when names are in Arabic or have accents.
 */
function formatDeviceStudentName(rawName, globalNumber) {
  if (!rawName || typeof rawName !== "string") {
    return `ID #${globalNumber}`;
  }

  let text = rawName.trim();
  if (!text) return `ID #${globalNumber}`;

  // Check if string contains Arabic characters
  const hasArabic = /[\u0600-\u06FF]/.test(text);

  if (hasArabic) {
    // 1. Strip Tashkeel (harakat), Tatweel (kashida), and Quranic marks
    text = text
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/[\u0640]/g, "");

    // 2. Normalize common Algerian prefixes and composite religious names
    text = text
      .replace(/عبد\s*الله/g, "Abdallah")
      .replace(/عبد\s*الرحمن/g, "Abdelrahman")
      .replace(/عبد\s*الرحمان/g, "Abdelrahman")
      .replace(/عبد\s*القادر/g, "Abdelkader")
      .replace(/عبد\s*الكريم/g, "Abdelkarim")
      .replace(/عبد\s*العزيز/g, "Abdelaziz")
      .replace(/عبد\s*المالك/g, "Abdelmalek")
      .replace(/عبد\s*الحميد/g, "Abdelhamid")
      .replace(/عبد\s*الحليم/g, "Abdelhalim")
      .replace(/عبد\s*الرزاق/g, "Abderrezak")
      .replace(/عبد\s*الرؤوف/g, "Abderraouf")
      .replace(/عبد\s*النور/g, "Abdennour")
      .replace(/عبد\s*المؤمن/g, "Abdelmoumen")
      .replace(/عبد\s*الحق/g, "Abdelhak")
      .replace(/عبد\s*المجيد/g, "Abdelmadjid")
      .replace(/عبد\s*الوهاب/g, "Abdelwahab")
      .replace(/عبد\s*اللطيف/g, "Abdellatif")
      .replace(/عبد\s*/g, "Abd ")
      .replace(/بن\s*/g, "Ben ")
      .replace(/بو\s*/g, "Bou ")
      .replace(/ولد\s*/g, "Ould ")
      .replace(/أيت\s*|ايت\s*/g, "Ait ")
      .replace(/بل\s*/g, "Bel ")
      .replace(/ال\s*/g, "El ");

    // 3. Common Algerian / Arabic Names dictionary for perfect phonetic French/English spelling
    const nameMap = {
      "محمد": "Mohamed", "محمود": "Mahmoud", "احمد": "Ahmed", "أحمد": "Ahmed",
      "علي": "Ali", "عمر": "Omar", "عثمان": "Othmane", "يوسف": "Youssef",
      "يونس": "Younes", "ياسين": "Yassine", "يحيى": "Yahia", "ابراهيم": "Ibrahim",
      "إبراهيم": "Ibrahim", "اسماعيل": "Ismail", "إسماعيل": "Ismail", "ايوب": "Ayoub",
      "أيوب": "Ayoub", "حمزة": "Hamza", "خالد": "Khaled", "وسيم": "Wassim",
      "تموسي": "Temoussi", "بلقاسم": "Belkacem", "فاطمة": "Fatima", "مريم": "Meryem",
      "سارة": "Sarah", "خديجة": "Khadidja", "عائشة": "Aicha", "امينة": "Amina",
      "أمينة": "Amina", "امين": "Amine", "أمين": "Amine", "اسلام": "Islam",
      "إسلام": "Islam", "ايمن": "Aymen", "أيمن": "Aymen", "انور": "Anouar",
      "أنور": "Anouar", "مهدي": "Mehdi", "كريم": "Karim", "رياض": "Riad",
      "وليد": "Walid", "بلال": "Bilal", "طه": "Taha", "سامي": "Sami",
      "صالح": "Salah", "حسام": "Houssam", "طارق": "Tarek", "مراد": "Mourad",
      "فارس": "Fares", "حكيم": "Hakim", "عادل": "Adel", "سفيان": "Sofiane",
      "سمير": "Samir", "رضوان": "Redouane", "نور": "Nour", "هدى": "Houda",
      "سلمى": "Salma", "رانيا": "Rania", "مروة": "Marwa", "اية": "Aya",
      "آية": "Aya", "هبة": "Hiba", "زينب": "Zineb", "صفاء": "Safaa",
      "وئام": "Wiam", "احلام": "Ahlem", "أحلام": "Ahlem", "اسماء": "Asma",
      "أسماء": "Asma", "شيماء": "Chaimaa", "زهور": "Zohour", "جمال": "Djamel",
      "جهاد": "Djihad", "جعفر": "Djaafar", "شكيب": "Chakib", "شمس": "Chams",
      "بشير": "Bachir", "منير": "Mounir", "نذير": "Nadhir", "نبيل": "Nabil",
      "الياس": "Ilyes", "إلياس": "Ilyes", "زكرياء": "Zakaria", "زكريا": "Zakaria",
    };

    for (const [ar, lat] of Object.entries(nameMap)) {
      const reg = new RegExp(`(^|\\s)${ar}(\\s|$)`, "g");
      text = text.replace(reg, `$1${lat}$2`);
    }

    // 4. Letter-by-letter transliteration for remaining Arabic characters
    const charMap = {
      "أ": "A", "إ": "I", "آ": "A", "ا": "A", "ء": "", "ئ": "Y", "ؤ": "Ou",
      "ب": "B", "ت": "T", "ث": "Th", "ج": "Dj", "ح": "H", "خ": "Kh",
      "د": "D", "ذ": "Dh", "ر": "R", "ز": "Z", "س": "S", "ش": "Ch",
      "ص": "S", "ض": "D", "ط": "T", "ظ": "Dh", "ع": "A", "غ": "Gh",
      "ف": "F", "ق": "K", "ك": "K", "ل": "L", "م": "M", "ن": "N",
      "ه": "H", "و": "Ou", "ي": "Y", "ى": "A", "ة": "a"
    };

    let transliterated = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (charMap[ch] !== undefined) {
        transliterated += charMap[ch];
      } else {
        transliterated += ch;
      }
    }
    text = transliterated;
  }

  // Decompose any Latin accents (é -> e, etc.) and strip unsupported non-ASCII
  text = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s\.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return `ID #${globalNumber}`;
  }

  // Format Title Case: "mohamed benali" -> "Mohamed Benali"
  text = text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  // Max 23 characters for ZKTeco 24-byte null-terminated name buffer
  return text.slice(0, 23);
}

function buildUser72Packet(uid, name, userId) {
  const buf = Buffer.alloc(72, 0);
  buf.writeUInt16LE(uid & 0xffff, 0);
  buf.writeUInt8(0, 2);
  buf.write(formatDeviceStudentName(name, uid), 11, 24, "ascii");
  buf.writeUInt32LE(0, 35);
  buf.writeUInt8(0, 39);
  buf.write("1", 40, 7, "ascii");
  buf.writeUInt8(0, 47);
  buf.write(String(userId).slice(0, 23), 48, 24, "ascii");
  return buf;
}

function sendToDevice(dev, cmd, data = Buffer.alloc(0)) {
  if (!dev || !dev.socket || dev.socket.destroyed) return false;
  try {
    dev.replyId = (dev.replyId + 1) % 65530;
    const pkt = buildZkTcpPacket(cmd, dev.sessionId, dev.replyId, data);
    dev.socket.write(pkt);
    return true;
  } catch {
    return false;
  }
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

function isDeviceTrulyAlive(dev) {
  if (!dev || !dev.isConnected || !dev.socket || dev.socket.destroyed) {
    return false;
  }
  if (Date.now() - dev.lastRxAt > ZOMBIE_TIMEOUT_MS) {
    return false;
  }
  return true;
}

function isAnyDeviceConnected() {
  for (const dev of devices.values()) {
    if (isDeviceTrulyAlive(dev)) return true;
  }
  return false;
}

function destroyDeviceSocket(dev, reason) {
  if (!dev) return;
  const wasConnected = dev.isConnected;
  dev.isConnected = false;
  dev.isConnecting = false;
  dev.sessionId = 0;
  if (dev.connectTimer) {
    clearTimeout(dev.connectTimer);
    dev.connectTimer = null;
  }
  if (dev.pendingAcks) {
    for (const cb of dev.pendingAcks.values()) {
      try {
        cb({ success: false, error: "socket destroyed" });
      } catch {}
    }
    dev.pendingAcks.clear();
  }
  if (dev.templateListener) {
    try {
      dev.templateListener(CMD_ACK_ERROR, Buffer.alloc(0));
    } catch {}
    dev.templateListener = null;
  }
  if (dev.socket) {
    try {
      dev.socket.removeAllListeners();
      dev.socket.destroy();
    } catch {}
    dev.socket = null;
  }
  if (wasConnected) {
    console.log(
      `[K50 Bridge] ! Connection reset for ${dev.ip}:${DEVICE_PORT} (${reason}). Auto-reconnecting...`
    );
    broadcastSse({
      type: "status",
      connected: isAnyDeviceConnected(),
      deviceIp: CONFIGURED_IPS.join(","),
    });
  }
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
    `[K50 Bridge] Deleted user #${globalNumber} from K50 Pro flash memory.`
  );
}

// Low-Level Promise-based ZKTeco Command Sender with ACK resolution
function sendZkCommandWithAck(dev, cmd, data = Buffer.alloc(0), timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!dev || !dev.socket || dev.socket.destroyed || !dev.isConnected) {
      return resolve({ success: false, error: "not_connected" });
    }
    dev.replyId = (dev.replyId + 1) % 65530;
    const reqReplyId = dev.replyId;

    const timer = setTimeout(() => {
      if (dev.pendingAcks) {
        dev.pendingAcks.delete(reqReplyId);
        if (dev.pendingAcks.get("any") === onAck) {
          dev.pendingAcks.delete("any");
        }
      }
      resolve({ success: false, error: "timeout" });
    }, timeoutMs);

    const onAck = (res) => {
      clearTimeout(timer);
      if (dev.pendingAcks) {
        dev.pendingAcks.delete(reqReplyId);
        if (dev.pendingAcks.get("any") === onAck) {
          dev.pendingAcks.delete("any");
        }
      }
      resolve(res);
    };

    if (!dev.pendingAcks) dev.pendingAcks = new Map();
    dev.pendingAcks.set(reqReplyId, onAck);
    dev.pendingAcks.set("any", onAck);

    const pkt = buildZkTcpPacket(cmd, dev.sessionId, reqReplyId, data);
    try {
      dev.socket.write(pkt);
    } catch {
      clearTimeout(timer);
      resolve({ success: false, error: "write_error" });
    }
  });
}

/**
 * Downloads a student's fingerprint biometric template from the physical K50 Pro terminal
 */
function downloadTemplateFromDevice(dev, globalNumber, fingerIndex = 0, timeoutMs = 2500) {
  if (!dev || !dev.isConnected || !dev.socket || dev.socket.destroyed) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const chunks = [];
    let expectedLen = 0;
    let timer = null;
    let finished = false;

    const cleanup = () => {
      dev.templateListener = null;
      if (timer) clearTimeout(timer);
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    timer = setTimeout(() => {
      const combined = Buffer.concat(chunks);
      finish(combined.length > 20 ? combined : null);
    }, timeoutMs);

    dev.templateListener = (cmd, payload) => {
      if (cmd === CMD_PREPARE_DATA) {
        if (payload.length >= 4) {
          expectedLen = payload.readUInt32LE(0);
        }
      } else if (cmd === CMD_DATA) {
        chunks.push(payload);
        const curLen = Buffer.concat(chunks).length;
        if (expectedLen > 0 && curLen >= expectedLen) {
          finish(Buffer.concat(chunks));
        }
      } else if (cmd === CMD_ACK_OK) {
        if (payload.length > 20) {
          chunks.push(payload);
        }
        const combined = Buffer.concat(chunks);
        finish(combined.length > 20 ? combined : null);
      } else if (cmd === CMD_ACK_ERROR || cmd === CMD_ACK_UNAUTH) {
        finish(null);
      }
    };

    const reqBuf = Buffer.alloc(3);
    reqBuf.writeUInt16LE(globalNumber & 0xffff, 0);
    reqBuf.writeUInt8(fingerIndex & 0xff, 2);
    sendToDevice(dev, CMD_USERTEMP_RRQ, reqBuf);
  });
}

/**
 * Uploads a student's biometric template buffer into the physical K50 Pro terminal flash memory
 */
async function uploadTemplateToDevice(dev, globalNumber, fingerIndex, templateBuffer) {
  if (!dev || !dev.isConnected || !dev.socket || dev.socket.destroyed) {
    return false;
  }
  try {
    const CHUNK_SIZE = 1024;
    // 1. Prepare data transfer buffer on K50
    const prepBuf = Buffer.alloc(4);
    prepBuf.writeUInt32LE(templateBuffer.length, 0);
    await sendZkCommandWithAck(dev, CMD_PREPARE_DATA, prepBuf, 1500);

    // 2. Send template data chunks
    for (let offset = 0; offset < templateBuffer.length; offset += CHUNK_SIZE) {
      const chunk = templateBuffer.subarray(
        offset,
        Math.min(offset + CHUNK_SIZE, templateBuffer.length)
      );
      await sendZkCommandWithAck(dev, CMD_DATA, chunk, 1500);
    }

    // 3. Checksum buffer on device
    await sendZkCommandWithAck(dev, CMD_CHECKSUM_BUFFER, Buffer.alloc(0), 1500);

    // 4. Commit template to flash memory: CMD_TMP_WRITE (87)
    // Structure: uid (2 bytes uint16), fid (1 byte uint8), valid (1 byte uint8 = 1), size (2 bytes uint16)
    const tmpWreq = Buffer.alloc(6);
    tmpWreq.writeUInt16LE(globalNumber & 0xffff, 0);
    tmpWreq.writeUInt8(fingerIndex & 0xff, 2);
    tmpWreq.writeUInt8(1, 3);
    tmpWreq.writeUInt16LE(templateBuffer.length, 4);

    const writeRes = await sendZkCommandWithAck(dev, CMD_TMP_WRITE, tmpWreq, 2000);
    if (!writeRes.success || writeRes.cmd !== CMD_ACK_OK) {
      // Fallback to legacy CMD_USERTEMP_WRQ (10) if firmware expects command 10
      await sendZkCommandWithAck(dev, CMD_USERTEMP_WRQ, tmpWreq, 1500);
    }

    // 5. Release transfer buffer
    await sendZkCommandWithAck(dev, CMD_FREE_DATA, Buffer.alloc(0), 1000);
    return true;
  } catch (err) {
    console.error(`[K50 Cloud Sync] Upload error for #${globalNumber}:`, err.message);
    return false;
  }
}

function loadSyncCache() {
  try {
    if (fs.existsSync(SYNC_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_CACHE_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveSyncCache(cache) {
  try {
    fs.writeFileSync(SYNC_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch {}
}

function fetchFromCloud(path) {
  return new Promise((resolve) => {
    if (!state.appUrl) return resolve(null);
    try {
      const targetUrl = new URL(path, state.appUrl);
      const client = targetUrl.protocol === "https:" ? https : http;
      const req = client.get(targetUrl, { timeout: 8000 }, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

function postToCloud(path, payload) {
  return new Promise((resolve) => {
    if (!state.appUrl) return resolve(null);
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
          timeout: 7000,
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

/**
 * Bi-directional Cloud Multi-Branch Synchronizer
 * 1. Backfill: If any student in cloud is missing their biometric template and local K50 has it, extract & push to cloud.
 * 2. Download: For all students in cloud, push User record + Template into local K50 Pro hardware.
 */
async function syncTemplatesWithCloud(force = false) {
  if (state.isSyncing) {
    return { success: false, message: "Sync already in progress" };
  }
  if (!state.appUrl) {
    return { success: false, message: "Cloud URL not configured yet" };
  }
  if (!isAnyDeviceConnected()) {
    return { success: false, message: "No K50 Pro device connected" };
  }

  state.isSyncing = true;
  console.log(`[K50 Cloud Sync] Starting multi-branch synchronization with ${state.appUrl}...`);

  try {
    const cloudData = await fetchFromCloud("/api/biometrics/templates");
    if (!cloudData || !cloudData.success || !Array.isArray(cloudData.templates)) {
      console.warn("[K50 Cloud Sync] Could not fetch templates from cloud.");
      return { success: false, message: "Failed to fetch cloud templates" };
    }

    const templates = cloudData.templates;
    const cache = loadSyncCache();
    let syncedCount = 0;
    let prunedCount = 0;

    // Phase 1: PRUNE TOMBSTONED / DELETED HARDWARE USERS FROM FLASH MEMORY
    if (Array.isArray(cloudData.deletedGlobalNumbers)) {
      for (const delNum of cloudData.deletedGlobalNumbers) {
        if (delNum > 0) {
          deleteHardwareUserOnAllDevices(delNum);
          for (let fi = 0; fi <= 9; fi++) {
            delete cache[`${delNum}_${fi}`];
          }
          prunedCount++;
        }
      }
      if (prunedCount > 0) {
        console.log(`[K50 Cloud Sync] ✗ Pruned ${prunedCount} tombstoned users from K50 hardware flash.`);
      }
    }

    // Phase 2: DOWNLOAD TO HARDWARE
    for (const t of templates) {
      if (!t.globalNumber || t.globalNumber <= 0) continue;
      const key = `${t.globalNumber}_${t.fingerIndex || 0}`;
      const lastSyncedAt = cache[key]?.updatedAt;

      const needsSync =
        force ||
        !lastSyncedAt ||
        lastSyncedAt !== t.updatedAt ||
        cache[key]?.studentName !== t.studentName;
      if (!needsSync) continue;

      const hasRealTemplate = Boolean(
        t.templateData && !t.templateData.startsWith("ZK_K50_") && t.templateData.length > 20
      );

      // 1. Write user record to all connected local K50 devices
      const userPkt = buildUser72Packet(t.globalNumber, t.studentName, String(t.globalNumber));
      sendToAllDevices(CMD_USER_WRQ, userPkt);

      // 2. If real template exists, write it into the local K50 flash memory
      if (hasRealTemplate) {
        const tplBuf = Buffer.from(t.templateData, "base64");
        for (const dev of devices.values()) {
          if (!dev.isConnected) continue;
          await uploadTemplateToDevice(dev, t.globalNumber, t.fingerIndex || 0, tplBuf);
        }
      }

      cache[key] = {
        globalNumber: t.globalNumber,
        studentName: t.studentName,
        hasTemplate: hasRealTemplate,
        updatedAt: t.updatedAt,
      };
      syncedCount++;
      console.log(
        `[K50 Cloud Sync] ↓ Synced Student #${t.globalNumber} (${t.studentName}, template=${
          hasRealTemplate ? "YES" : "NO"
        }) to local K50!`
      );
    }

    if (syncedCount > 0 || prunedCount > 0) {
      sendToAllDevices(CMD_REFRESHDATA);
      sendToAllDevices(CMD_STARTVERIFY);
      sendToAllDevices(CMD_ENABLEDEVICE);
      saveSyncCache(cache);
    }

    console.log(
      `[K50 Cloud Sync] ✓ Multi-branch sync complete: ${syncedCount} downloaded, ${prunedCount} tombstoned users pruned.`
    );

    broadcastSse({
      type: "sync_complete",
      syncedCount,
      prunedCount,
      totalTemplates: templates.length,
      timestamp: Date.now(),
    });

    return {
      success: true,
      syncedCount,
      prunedCount,
      totalTemplates: templates.length,
      message: `Synchronisation terminée : ${syncedCount} élèves synchronisés sur ce lecteur K50 Pro.`,
    };
  } catch (err) {
    console.error("[K50 Cloud Sync] Sync error:", err);
    return { success: false, message: err.message };
  } finally {
    state.isSyncing = false;
  }
}

async function dispatchScanEvent(scanPayload) {
  // 1. Instantly broadcast pending event to open browser SSE clients for 0ms visual/audio response
  broadcastSse({
    type: "scan_pending",
    ...scanPayload,
    timestamp: Date.now(),
  });

  // 2. ALWAYS persist directly to backend database so presence is NEVER lost,
  // even if browser tabs are asleep, navigating, or closed!
  if (state.appUrl) {
    try {
      const cloudRes = await postToCloud("/api/biometrics/scan", {
        branchId: state.branchId,
        openLessonId: state.openLessonId,
        ...scanPayload,
      });
      if (cloudRes && cloudRes.success) {
        if (
          cloudRes.scan?.status === "UNRECOGNIZED" &&
          scanPayload.globalNumber > 0
        ) {
          deleteHardwareUserOnAllDevices(scanPayload.globalNumber);
        }
        // Broadcast the fully resolved scan object (with student name, lesson, status) to all UIs
        if (cloudRes.scan) {
          broadcastSse({
            type: "scan_resolved",
            scan: cloudRes.scan,
            timestamp: Date.now(),
          });
        }
        return;
      }
    } catch (err) {
      console.error("[K50 Bridge] Error posting scan to app:", err.message);
    }
  }

  // 3. Fallback queue if appUrl is unreachable (persisted so it retries on next poll or via UI fallback)
  state.pendingScans.push(scanPayload);
  if (state.pendingScans.length > 50) {
    state.pendingScans.shift();
  }

  // Broadcast fallback scan so active UI tab can attempt the post if bridge network fails
  broadcastSse({
    type: "scan",
    ...scanPayload,
    fallback: true,
    timestamp: Date.now(),
  });
}

function scheduleUnrecognizedFingerCheck(delayMs = 220) {
  if (state.verifyFailTimer) clearTimeout(state.verifyFailTimer);
  state.verifyFailTimer = setTimeout(() => {
    state.verifyFailTimer = null;
    const now = Date.now();
    if (
      now - state.lastAttLogAt < 800 ||
      now - state.lastUnrecognizedAt < 1400 ||
      state.enrollment.active
    ) {
      return;
    }
    state.lastUnrecognizedAt = now;
    console.log(
      `[K50 Bridge] ✗ Unrecognized Finger ("Try again") -> Instant State 4`
    );
    dispatchScanEvent({ isUnrecognizedFinger: true });
  }, delayMs);
}

function handleRealTimeEvent(dev, eventType, payload) {
  dev.lastRxAt = Date.now();

  // 1. Enrollment mode (3 finger taps on the specific enrolling reader only!)
  const isEnrollingDevice =
    state.enrollment.active &&
    (!state.enrollment.enrollingDeviceIp || dev.ip === state.enrollment.enrollingDeviceIp);

  if (isEnrollingDevice) {
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
        broadcastSse({
          type: "enroll_progress",
          enrollment: state.enrollment,
        });
        console.log(
          `[K50 Enroll] (${dev.ip}) Student #${state.enrollment.globalNumber} -> Tap ${state.enrollment.step}/3`
        );
      }
      return;
    }

    if (eventType === EF_ENROLLFINGER || eventType === EF_ENROLLUSER) {
      const enrollRes = payload.length >= 2 ? payload.readUInt16LE(0) : 0;
      const enrolledNum = state.enrollment.globalNumber;
      const fingerIdx = state.enrollment.fingerIndex || 0;

      sendToDevice(dev, CMD_REFRESHDATA);
      sendToDevice(dev, CMD_STARTVERIFY);
      sendToDevice(dev, CMD_ENABLEDEVICE);

      if (enrollRes === 0) {
        state.enrollment.step = 3;
        state.enrollment.active = false;
        state.enrollment.enrollingDeviceIp = null;
        state.enrollment.status = "SUCCESS";
        state.enrollment.message = `Fingerprint enrolled on K50 Pro (#${enrolledNum})!`;
        state.enrollment.updatedAt = Date.now();
        console.log(`[K50 Enroll] ✓ SUCCESS on ${dev.ip} for Student #${enrolledNum}. Extracting biometric template...`);

        // Automatically extract template from local K50 & persist to cloud + sibling devices
        setTimeout(async () => {
          try {
            const tplBuf = await downloadTemplateFromDevice(dev, enrolledNum, fingerIdx, 2000);
            if (tplBuf && tplBuf.length > 20) {
              const b64 = tplBuf.toString("base64");
              state.enrollment.templateData = b64;
              console.log(
                `[K50 Cloud Sync] ✓ Biometric template extracted (${tplBuf.length} bytes) for #${enrolledNum}. Uploading to Cloud DB...`
              );
              if (state.appUrl) {
                await postToCloud("/api/biometrics/templates", {
                  globalNumber: enrolledNum,
                  fingerIndex: fingerIdx,
                  templateData: b64,
                  branchId: state.branchId,
                });
                console.log(
                  `[K50 Cloud Sync] ✓ Template #${enrolledNum} saved to Cloud DB! Will auto-sync across all school branches.`
                );
              }

              // Immediately push the newly registered template to all other devices connected to this PC!
              const userPkt = buildUser72Packet(enrolledNum, state.enrollment.studentName, String(enrolledNum));
              for (const otherDev of devices.values()) {
                if (otherDev.ip !== dev.ip && isDeviceTrulyAlive(otherDev)) {
                  try {
                    sendToDevice(otherDev, CMD_USER_WRQ, userPkt);
                    await uploadTemplateToDevice(otherDev, enrolledNum, fingerIdx, tplBuf);
                    sendToDevice(otherDev, CMD_REFRESHDATA);
                    sendToDevice(otherDev, CMD_STARTVERIFY);
                    sendToDevice(otherDev, CMD_ENABLEDEVICE);
                    console.log(`[K50 Multi-Device] ✓ Instant sync of newly registered student #${enrolledNum} to sibling reader ${otherDev.ip}!`);
                  } catch (pushErr) {
                    console.warn(`[K50 Multi-Device] Could not push to sibling ${otherDev.ip}:`, pushErr.message);
                  }
                }
              }
            }
          } catch (e) {
            console.error(`[K50 Cloud Sync] Error extracting template after enroll:`, e.message);
          }
          broadcastSse({
            type: "enroll_progress",
            enrollment: state.enrollment,
          });
        }, 200);
      } else {
        state.enrollment.active = false;
        state.enrollment.enrollingDeviceIp = null;
        state.enrollment.status = "FAILED";
        state.enrollment.message =
          "Failed to read finger on K50 Pro (finger already registered or poorly placed). Please try again.";
        state.enrollment.updatedAt = Date.now();
        console.warn(
          `[K50 Enroll] ✗ FAILED (code=${enrollRes}) on ${dev.ip} for #${enrolledNum}`
        );
        broadcastSse({
          type: "enroll_progress",
          enrollment: state.enrollment,
        });
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
        `[K50 Bridge] ✓ Finger Recognized -> Student #${globalNumber} (Instant Push)`
      );
      dispatchScanEvent({ globalNumber });
    } else {
      dispatchScanEvent({ isUnrecognizedFinger: true });
    }
    return;
  }

  if (
    eventType === EF_ALARM ||
    eventType === EF_FPFTR ||
    eventType === EF_FINGER ||
    eventType === EF_VERIFY
  ) {
    const delayMs = eventType === EF_ALARM ? 120 : 240;
    scheduleUnrecognizedFingerCheck(delayMs);
  }
}

function connectDevice(ip, force = false) {
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
      lastRxAt: 0,
      connectTimer: null,
      pendingAcks: new Map(),
      templateListener: null,
    };
    devices.set(ip, dev);
  }

  if (force) {
    destroyDeviceSocket(dev, "manual force reconnect");
  }

  if (dev.isConnected && !isDeviceTrulyAlive(dev)) {
    destroyDeviceSocket(dev, "idle/zombie session timeout");
  }

  if (dev.isConnected || dev.isConnecting) {
    return;
  }

  dev.isConnecting = true;
  const sock = new net.Socket();
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 5000);
  dev.socket = sock;
  dev.rxBuffer = Buffer.alloc(0);

  dev.connectTimer = setTimeout(() => {
    if (!dev.isConnected) {
      destroyDeviceSocket(dev, "connect handshake timeout (2s)");
    }
  }, CONNECT_TIMEOUT_MS);

  sock.connect(DEVICE_PORT, ip, () => {
    if (dev.socket !== sock) return;
    dev.sessionId = 0;
    dev.replyId = 0;
    dev.lastRxAt = Date.now();
    sock.write(buildZkTcpPacket(CMD_CONNECT, 0, 0));
  });

  sock.on("data", (chunk) => {
    if (dev.socket !== sock) return;
    dev.lastRxAt = Date.now();
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

      // 1. Template download listener
      if (dev.templateListener) {
        dev.templateListener(cmd, payload);
      }

      // 2. Pending request ACKs
      if (dev.pendingAcks && dev.pendingAcks.has(rId)) {
        const handler = dev.pendingAcks.get(rId);
        dev.pendingAcks.delete(rId);
        handler({ success: true, cmd, sId, rId, payload });
      } else if (dev.pendingAcks && dev.pendingAcks.has("any") && cmd === CMD_ACK_OK) {
        const handler = dev.pendingAcks.get("any");
        dev.pendingAcks.delete("any");
        handler({ success: true, cmd, sId, rId, payload });
      }

      // 3. Protocol handshake
      if (cmd === CMD_ACK_UNAUTH) {
        dev.sessionId = sId;
        dev.replyId = rId;
        sendToDevice(dev, CMD_AUTH, makeCommKey(COMM_KEY, dev.sessionId));
      } else if (cmd === CMD_ACK_OK) {
        if (!dev.isConnected) {
          if (sId !== 0 && dev.sessionId === 0) dev.sessionId = sId;
          dev.isConnected = true;
          dev.isConnecting = false;
          if (dev.connectTimer) {
            clearTimeout(dev.connectTimer);
            dev.connectTimer = null;
          }
          console.log(
            `[K50 Bridge v4] ✓ Connected & Authenticated to ZKTeco K50 Pro (${ip}:${DEVICE_PORT}, Session #${dev.sessionId})`
          );
          const maskBuf = Buffer.alloc(4);
          maskBuf.writeUInt32LE(EVENT_MASK, 0);
          sendToDevice(dev, CMD_REG_EVENT, maskBuf);
          setTimeout(() => sendToDevice(dev, CMD_ENABLEDEVICE), 60);
          setTimeout(() => sendToDevice(dev, CMD_STARTVERIFY), 120);
          broadcastSse({
            type: "status",
            connected: true,
            deviceIp: CONFIGURED_IPS.join(","),
          });

          // Auto-trigger sync with cloud 2 seconds after connecting
          if (state.appUrl && !state.hasInitialSynced) {
            state.hasInitialSynced = true;
            setTimeout(() => syncTemplatesWithCloud(false), 2000);
          }
        }
      } else if (cmd === CMD_REG_EVENT) {
        if (dev.socket && !dev.socket.destroyed) {
          dev.socket.write(buildZkTcpPacket(CMD_ACK_OK, dev.sessionId, 0));
        }
        handleRealTimeEvent(dev, sId, payload);
      }
    }
  });

  sock.on("error", () => {
    if (dev.socket === sock) {
      destroyDeviceSocket(dev, "socket error");
    }
  });

  sock.on("close", () => {
    if (dev.socket === sock) {
      destroyDeviceSocket(dev, "socket closed");
    }
  });
}

async function ensureTargetDeviceReadyForEnroll(targetIp = null, timeoutMs = 2500) {
  let dev = targetIp && devices.has(targetIp) ? devices.get(targetIp) : null;
  if (!dev) {
    for (const d of devices.values()) {
      if (isDeviceTrulyAlive(d)) {
        dev = d;
        break;
      }
    }
  }

  if (dev && isDeviceTrulyAlive(dev) && Date.now() - dev.lastRxAt < 6000) {
    return dev;
  }

  if (dev) {
    connectDevice(dev.ip, true);
  } else {
    for (const ip of CONFIGURED_IPS) {
      connectDevice(ip, true);
    }
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (dev && isDeviceTrulyAlive(dev)) return dev;
    if (!dev) {
      for (const d of devices.values()) {
        if (isDeviceTrulyAlive(d)) return d;
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  if (dev && isDeviceTrulyAlive(dev)) return dev;
  for (const d of devices.values()) {
    if (isDeviceTrulyAlive(d)) return d;
  }
  return null;
}

// 1. Reconnection & Zombie-Check Loop every 2.5 seconds
setInterval(() => {
  for (const ip of CONFIGURED_IPS) {
    connectDevice(ip, false);
  }
}, RECONNECT_LOOP_MS);

// 2. Active ZKTeco Protocol Heartbeat Loop every 8 seconds (CMD_GET_TIME keepalive)
// Keeps TCP tunnel open, keeps Realtek Ethernet awake, and verifies device responsiveness
// WITHOUT resetting the real-time event listener or flooding the K50 firmware!
setInterval(() => {
  for (const dev of devices.values()) {
    if (!dev.isConnected) continue;
    if (!isDeviceTrulyAlive(dev)) {
      destroyDeviceSocket(dev, "heartbeat timeout - device unresponsive");
      connectDevice(dev.ip, false);
      continue;
    }
    // Only send keepalive when no complex transaction (enrollment/sync/pending ACK) is active
    if (
      !state.enrollment.active &&
      !state.isSyncing &&
      (!dev.pendingAcks || dev.pendingAcks.size === 0)
    ) {
      sendToDevice(dev, CMD_GET_TIME);
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// 3. Periodic Background Cloud Sync Loop every 5 minutes
setInterval(() => {
  if (state.appUrl && isAnyDeviceConnected() && !state.enrollment.active && !state.isSyncing) {
    syncTemplatesWithCloud(false);
  }
}, 5 * 60 * 1000);

for (const ip of CONFIGURED_IPS) {
  connectDevice(ip, false);
}

// Local HTTP & SSE Server on 127.0.0.1:4375 for browser communication
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

  // Instant 0ms Server-Sent Events (SSE) stream for the browser on this PC
  if (req.method === "GET" && pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    sseClients.add(res);

    res.write(
      `data: ${JSON.stringify({
        type: "status",
        connected: isAnyDeviceConnected(),
        deviceIp: CONFIGURED_IPS.join(","),
      })}\n\n`
    );

    if (state.pendingScans.length > 0) {
      const drained = state.pendingScans.splice(0, state.pendingScans.length);
      for (const ev of drained) {
        res.write(`data: ${JSON.stringify({ type: "scan", ...ev })}\n\n`);
      }
    }

    req.on("close", () => {
      sseClients.delete(res);
    });
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // On-demand Multi-Branch Biometric Sync Endpoint: GET /sync
  if (req.method === "GET" && pathname === "/sync") {
    const appUrlParam = parsedUrl.searchParams.get("appUrl");
    if (appUrlParam && appUrlParam.startsWith("http")) {
      state.appUrl = appUrlParam;
    }
    syncTemplatesWithCloud(true).then((syncRes) => {
      res.writeHead(200);
      res.end(JSON.stringify(syncRes));
    });
    return;
  }

  if (req.method === "GET" && pathname === "/status") {
    const appUrlParam = parsedUrl.searchParams.get("appUrl");
    const branchIdParam = Number(parsedUrl.searchParams.get("branchId") || 0);
    const openLessonParam = Number(
      parsedUrl.searchParams.get("openLessonId") || 0
    );
    const forceReconnect =
      parsedUrl.searchParams.get("forceReconnect") === "1";

    if (appUrlParam && appUrlParam.startsWith("http")) {
      const wasEmpty = !state.appUrl;
      state.appUrl = appUrlParam;
      saveBridgeConfig({ appUrl: state.appUrl });
      // Auto-trigger sync with cloud if appUrl was just provided and reader is connected
      if (wasEmpty && isAnyDeviceConnected() && !state.hasInitialSynced) {
        state.hasInitialSynced = true;
        setTimeout(() => syncTemplatesWithCloud(false), 2000);
      }
    }
    if (branchIdParam > 0 && !process.env.BRANCH_ID) {
      if (state.branchId !== branchIdParam) {
        state.branchId = branchIdParam;
        saveBridgeConfig({ branchId: state.branchId });
      }
    } else if (branchIdParam > 0) {
      state.branchId = branchIdParam;
      saveBridgeConfig({ branchId: state.branchId });
    }
    state.openLessonId = openLessonParam > 0 ? openLessonParam : null;

    if (forceReconnect) {
      for (const ip of CONFIGURED_IPS) {
        connectDevice(ip, true);
      }
    }

    const connected = isAnyDeviceConnected();
    const drainedScans = state.pendingScans.splice(0, state.pendingScans.length);
    const devicesList = Array.from(devices.values()).map((d) => ({
      ip: d.ip,
      port: DEVICE_PORT,
      connected: isDeviceTrulyAlive(d),
      lastRxAt: d.lastRxAt,
    }));

    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        connected,
        deviceIp: CONFIGURED_IPS.join(","),
        devices: devicesList,
        enrollingDeviceIp: state.enrollment.enrollingDeviceIp,
        branchId: state.branchId,
        pendingScans: drainedScans,
        isSyncing: state.isSyncing,
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
    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");
        const globalNumber = Number(data.globalNumber || 1);
        const fingerIndex = Number(data.fingerIndex || 0);
        const studentName = data.studentName || `Student #${globalNumber}`;
        const targetIp = data.deviceIp || null;

        const targetDev = await ensureTargetDeviceReadyForEnroll(targetIp, 2500);
        if (!targetDev) {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              success: false,
              message: `Cannot reach K50 Pro (${targetIp || CONFIGURED_IPS.join(", ")}). Please check that the Ethernet cable is plugged in.`,
            })
          );
          return;
        }

        // Put target device into enrollment mode ONLY
        sendToDevice(targetDev, CMD_CANCELCAPTURE);
        const userPkt = buildUser72Packet(
          globalNumber,
          studentName,
          String(globalNumber)
        );
        sendToDevice(targetDev, CMD_USER_WRQ, userPkt);

        const delTempBuf = Buffer.alloc(25, 0);
        delTempBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
        delTempBuf.writeUInt8(fingerIndex, 24);
        sendToDevice(targetDev, CMD_DELETE_USERTEMP, delTempBuf);

        const enrollBuf = Buffer.alloc(26, 0);
        enrollBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
        enrollBuf.writeUInt8(fingerIndex, 24);
        enrollBuf.writeUInt8(1, 25);
        sendToDevice(targetDev, CMD_STARTENROLL, enrollBuf);

        // Put all OTHER connected devices into verify mode so attendance continues uninterrupted!
        for (const [ip, otherDev] of devices.entries()) {
          if (ip !== targetDev.ip && isDeviceTrulyAlive(otherDev)) {
            sendToDevice(otherDev, CMD_CANCELCAPTURE);
            sendToDevice(otherDev, CMD_STARTVERIFY);
            sendToDevice(otherDev, CMD_ENABLEDEVICE);
          }
        }

        state.enrollment = {
          active: true,
          enrollingDeviceIp: targetDev.ip,
          globalNumber,
          studentId: data.studentId || null,
          studentName,
          fingerIndex,
          templateData: null,
          step: 0,
          status: "WAITING_FINGER",
          message: `Place finger 3 times on reader ${targetDev.ip} (ID #${globalNumber})...`,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        };

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            globalNumber,
            enrollingDeviceIp: targetDev.ip,
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

    const enrollingIp = state.enrollment.enrollingDeviceIp;
    state.enrollment.active = false;
    state.enrollment.enrollingDeviceIp = null;
    state.enrollment.status = "CANCELLED";
    state.enrollment.updatedAt = Date.now();

    if (enrollingIp && devices.has(enrollingIp)) {
      const dev = devices.get(enrollingIp);
      sendToDevice(dev, CMD_CANCELCAPTURE);
      sendToDevice(dev, CMD_STARTVERIFY);
      sendToDevice(dev, CMD_ENABLEDEVICE);
    } else {
      sendToAllDevices(CMD_CANCELCAPTURE);
      sendToAllDevices(CMD_STARTVERIFY);
      sendToAllDevices(CMD_ENABLEDEVICE);
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ success: false, message: "Not Found" }));
});

server.listen(BRIDGE_PORT, "127.0.0.1", () => {
  console.log("==============================================================");
  console.log("  MASSINISSA ACADEMY — ZKTECO K50 PRO LOCAL BRIDGE (v4)");
  console.log(`  Local Server Active : http://127.0.0.1:${BRIDGE_PORT}`);
  console.log(`  K50 Pro Reader(s)   : ${CONFIGURED_IPS.join(", ")}:${DEVICE_PORT}`);
  console.log("  Multi-Branch Sync   : Active (Auto-sync with Cloud Database)");
  console.log("==============================================================");
});
