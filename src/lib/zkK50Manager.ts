import * as net from "net";
import prisma from "./prisma";
import {
  processBiometricScan,
  enrollStudentFingerprintAction,
} from "./biometricActions";

/**
 * ZKTeco K50 / K50 Pro Direct TCP/IP Hardware Manager (Port 4370)
 * ----------------------------------------------------------------------------
 * Connects directly from the Next.js Node.js backend to the physical
 * ZKTeco K50 Pro terminal (default 192.168.50.201:4370).
 */

const MANAGER_VERSION = 7;
const CONFIGURED_DEVICE_IPS = (process.env.ZK_DEVICE_IP || "192.168.50.201")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);
const DEFAULT_DEVICE_IP = CONFIGURED_DEVICE_IPS[0] || "192.168.50.201";
const DEFAULT_DEVICE_PORT = Number(process.env.ZK_DEVICE_PORT || "4370");
const DEFAULT_COMM_KEY = Number(process.env.ZK_COMM_KEY || "0");

// ZKTeco TCP & Command Constants
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

// Real-Time Event Flags (CMD_REG_EVENT = 500)
const EF_ATTLOG = 1; // 0x0001 - Valid attendance log
const EF_FINGER = 2; // 0x0002 - Finger placed on sensor
const EF_ENROLLUSER = 4; // 0x0004 - Enroll user
const EF_ENROLLFINGER = 8; // 0x0008 - Enroll finger finished
const EF_BUTTON = 16; // 0x0010 - Key press
const EF_VERIFY = 256; // 0x0100 - Verify user
const EF_FPFTR = 512; // 0x0200 - Finger score during capture/enroll
const EF_ALARM = 1024; // 0x0400 - K50 Pro "Try again" / Unrecognized finger event!
// Subscribe to all real-time events (0xFFFF)
const EVENT_MASK = 0x0000ffff;

export interface K50EnrollmentSession {
  active: boolean;
  deviceIp: string | null; // Only THIS reader enters record mode; the others keep taking attendance
  globalNumber: number;
  studentId: string | null;
  studentName: string;
  fingerIndex: number;
  step: number; // 0 = waiting for 1st tap, 1 = 1/3, 2 = 2/3, 3 = 3/3 completed
  status: "IDLE" | "WAITING_FINGER" | "SUCCESS" | "FAILED" | "CANCELLED";
  message: string;
  startedAt: number;
  updatedAt: number;
}

interface K50ManagerState {
  version: number;
  socket: net.Socket | null;
  rxBuffer: Buffer;
  isConnected: boolean;
  isConnecting: boolean;
  sessionId: number;
  replyId: number;
  deviceIp: string;
  devicePort: number;
  branchId: number;
  openLessonId: number | null;
  lastHeartbeatAt: number;
  reconnectTimer: NodeJS.Timeout | null;
  verifyFailTimer: NodeJS.Timeout | null;
  lastFingerTouchAt: number;
  lastAttLogAt: number;
  lastUnrecognizedAt: number;
  enrollment: K50EnrollmentSession;
  lastRawEvents: Array<{
    time: string;
    cmd: number;
    sId: number;
    rId: number;
    payloadHex: string;
  }>;
}

const globalForZk = globalThis as unknown as {
  __zkK50ManagerState?: K50ManagerState;
};

function getInitialEnrollment(): K50EnrollmentSession {
  return {
    active: false,
    deviceIp: null,
    globalNumber: 0,
    studentId: null,
    studentName: "",
    fingerIndex: 0,
    step: 0,
    status: "IDLE",
    message: "",
    startedAt: 0,
    updatedAt: Date.now(),
  };
}

function getState(): K50ManagerState {
  const existing = globalForZk.__zkK50ManagerState;
  if (existing && existing.version === MANAGER_VERSION) {
    return existing;
  }

  // Clean up any stale socket from an older hot-reloaded version
  if (existing?.socket) {
    try {
      existing.socket.removeAllListeners();
      existing.socket.destroy();
    } catch {
      // ignore
    }
  }
  if (existing?.reconnectTimer) clearTimeout(existing.reconnectTimer);
  if (existing?.verifyFailTimer) clearTimeout(existing.verifyFailTimer);

  globalForZk.__zkK50ManagerState = {
    version: MANAGER_VERSION,
    socket: null,
    rxBuffer: Buffer.alloc(0),
    isConnected: false,
    isConnecting: false,
    sessionId: 0,
    replyId: 0,
    deviceIp: DEFAULT_DEVICE_IP,
    devicePort: DEFAULT_DEVICE_PORT,
    branchId: existing?.branchId || 1,
    openLessonId: existing?.openLessonId ?? null,
    lastHeartbeatAt: 0,
    reconnectTimer: null,
    verifyFailTimer: null,
    lastFingerTouchAt: 0,
    lastAttLogAt: 0,
    lastUnrecognizedAt: 0,
    enrollment: getInitialEnrollment(),
    lastRawEvents: [],
  };
  return globalForZk.__zkK50ManagerState;
}

/**
 * Computes ZKTeco 16-bit 1's complement checksum
 */
function createChecksum(buf: Buffer): number {
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

/**
 * Generates the 4-byte ZKTeco CMD_AUTH (1102) session key payload
 */
function makeCommKey(key: number, sessionId: number, ticks: number = 50): Buffer {
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
  buf[0] ^= 0x5a; // 'Z'
  buf[1] ^= 0x4b; // 'K'
  buf[2] ^= 0x53; // 'S'
  buf[3] ^= 0x4f; // 'O'

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
function formatDeviceStudentName(rawName: string, globalNumber: number): string {
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
    const nameMap: Record<string, string> = {
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
    const charMap: Record<string, string> = {
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

/**
 * Builds the 72-byte ZKTeco TFT / K50 Pro user record (<HB8s24sIx7sx24s)
 */
function buildUser72Packet(
  uid: number,
  name: string,
  userId: string
): Buffer {
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

function sendZkCommand(
  cmd: number,
  data: Buffer = Buffer.alloc(0)
): boolean {
  const st = getState();
  if (!st.socket || st.socket.destroyed) return false;
  st.replyId = (st.replyId + 1) & 0xffff;
  const pkt = buildZkTcpPacket(cmd, st.sessionId, st.replyId, data);
  st.socket.write(pkt);
  return true;
}

async function touchDeviceHeartbeat(isOnline: boolean) {
  const st = getState();
  try {
    const existing = await prisma.biometricDevice.findFirst({
      where: { ipAddress: st.deviceIp },
    });
    if (existing) {
      await prisma.biometricDevice.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lastSeenAt: isOnline ? new Date() : existing.lastSeenAt,
        },
      });
    } else if (isOnline) {
      const firstBranch = await prisma.branch.findFirst({
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (firstBranch) {
        st.branchId = firstBranch.id;
        await prisma.biometricDevice.create({
          data: {
            name: "ZKTeco K50 Pro",
            ipAddress: st.deviceIp,
            port: st.devicePort,
            branchId: firstBranch.id,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });
      }
    }
  } catch {
    // Ignore DB heartbeat errors
  }
}

/**
 * Schedules a State 4 (Unrecognized Finger) scan if no EF_ATTLOG arrives within `delayMs`
 */
function scheduleUnrecognizedFingerCheck(
  delayMs: number = 550,
  deviceIp?: string
) {
  const st = getState();
  if (st.verifyFailTimer) {
    clearTimeout(st.verifyFailTimer);
  }
  st.verifyFailTimer = setTimeout(async () => {
    st.verifyFailTimer = null;
    const now = Date.now();
    // If an EF_ATTLOG (recognized user) occurred recently or we already triggered State 4 in the last 1.5s, skip
    if (now - st.lastAttLogAt < 900 || now - st.lastUnrecognizedAt < 1500) {
      return;
    }
    // Finger taps on the reader currently recording a fingerprint are
    // tap-counting, not attendance attempts — skip only for that reader.
    // Touches on every other reader are genuine scans and must be processed.
    if (
      st.enrollment.active &&
      (!st.enrollment.deviceIp || !deviceIp || deviceIp === st.enrollment.deviceIp)
    ) {
      return;
    }

    st.lastUnrecognizedAt = now;
    console.log(
      `[K50 Pro Live Scan] ✗ Finger NOT recognized ("Try again") -> Triggering State 4`
    );
    await processBiometricScan({
      branchId: st.branchId,
      isUnrecognizedFinger: true,
    });
  }, delayMs);
}

/**
 * Handles real-time events (CMD_REG_EVENT = 500) sent by the physical K50 Pro
 */
async function handleK50RealTimeEvent(
  eventType: number,
  payload: Buffer,
  deviceIp: string
) {
  const st = getState();
  st.lastHeartbeatAt = Date.now();

  // ---------------------------------------------------------------------------
  // 1. IF ENROLLMENT IS ACTIVE: Track 1/3 -> 2/3 -> 3/3 finger taps on K50 Pro
  // Only the reader that was put into record mode counts its taps. Every other
  // reader in the branch keeps taking attendance as usual.
  // ---------------------------------------------------------------------------
  if (
    st.enrollment.active &&
    (!st.enrollment.deviceIp || st.enrollment.deviceIp === deviceIp)
  ) {
    if (
      eventType === EF_VERIFY ||
      eventType === EF_FPFTR ||
      eventType === EF_FINGER ||
      eventType === EF_BUTTON ||
      eventType === EF_ALARM
    ) {
      const score = payload.length >= 1 ? payload.readUInt8(0) : 100;
      if (score > 0 || eventType !== EF_FPFTR) {
        const nextStep = Math.min(3, st.enrollment.step + 1);
        st.enrollment.step = nextStep;
        st.enrollment.updatedAt = Date.now();
        console.log(
          `[K50 Enroll] Student #${st.enrollment.globalNumber} -> Finger Press ${nextStep}/3 (event: ${eventType}, score: ${score})`
        );
      }
      return;
    }

    if (eventType === EF_ENROLLFINGER || eventType === EF_ENROLLUSER) {
      const enrollRes = payload.length >= 2 ? payload.readUInt16LE(0) : 0;
      const enrolledGlobalNumber = st.enrollment.globalNumber;
      const enrolledStudentId = st.enrollment.studentId;
      const enrolledFingerIndex = st.enrollment.fingerIndex;

      // Return K50 to normal attendance verification mode & refresh its cache
      sendZkCommand(CMD_REFRESHDATA);
      sendZkCommand(CMD_STARTVERIFY);
      sendZkCommand(CMD_ENABLEDEVICE);

      if (enrollRes === 0) {
        st.enrollment.step = 3;
        st.enrollment.active = false;
        st.enrollment.deviceIp = null;
        st.enrollment.status = "SUCCESS";
        st.enrollment.message = `Empreinte enregistrée sur le lecteur K50 Pro (#${enrolledGlobalNumber}) !`;
        st.enrollment.updatedAt = Date.now();
        // Sibling readers were kept in attendance mode; re-assert verify on them.
        forceAuxiliaryDevicesToVerify();
        console.log(
          `[K50 Enroll] ✓ SUCCESS for Student #${enrolledGlobalNumber}`
        );

        if (enrolledStudentId && enrolledGlobalNumber > 0) {
          await enrollStudentFingerprintAction({
            studentId: enrolledStudentId,
            globalNumber: enrolledGlobalNumber,
            fingerIndex: enrolledFingerIndex,
          });
        }
      } else {
        st.enrollment.active = false;
        st.enrollment.deviceIp = null;
        st.enrollment.status = "FAILED";
        st.enrollment.message =
          "Échec de lecture sur l'appareil K50 (doigt déjà utilisé ou mal posé). Réessayez.";
        st.enrollment.updatedAt = Date.now();
        forceAuxiliaryDevicesToVerify();
        console.warn(
          `[K50 Enroll] ✗ FAILED on K50 (code=${enrollRes}) for #${enrolledGlobalNumber}`
        );
      }
      return;
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. NORMAL ATTENDANCE MODE: Real-time finger recognition (EF_ATTLOG / EF_ALARM / EF_FINGER / EF_VERIFY)
  // ---------------------------------------------------------------------------
  if (eventType === EF_ATTLOG) {
    // Recognized student! Cancel any pending unrecognized finger timer immediately
    st.lastAttLogAt = Date.now();
    if (st.verifyFailTimer) {
      clearTimeout(st.verifyFailTimer);
      st.verifyFailTimer = null;
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
        `[K50 Pro Live Scan] ✓ Finger Recognized -> Student #${globalNumber} (branch=${st.branchId}, openLesson=${st.openLessonId ?? "none"})`
      );
      const res = await processBiometricScan({
        branchId: st.branchId,
        globalNumber,
        openLessonId: st.openLessonId,
      });
      // Self-healing: if this globalNumber was deleted from the DB, immediately wipe it from K50 Pro flash memory!
      if (res?.scan?.status === "UNRECOGNIZED") {
        console.log(
          `[K50 Pro Self-Heal] Student #${globalNumber} no longer exists in DB -> Wiping from K50 Pro hardware!`
        );
        await deleteK50HardwareUser(globalNumber);
      }
    } else {
      await processBiometricScan({
        branchId: st.branchId,
        isUnrecognizedFinger: true,
      });
    }
    return;
  }

  if (
    eventType === EF_ALARM ||
    eventType === EF_FPFTR ||
    eventType === EF_FINGER ||
    eventType === EF_VERIFY
  ) {
    // On K50 Pro (~ZKFPVersion=10), an unrecognized finger ("Try again") sends sId=1024 (EF_ALARM).
    // If EF_ATTLOG (1) does not arrive within 200ms, immediately trigger State 4 (Unrecognized Finger)!
    st.lastFingerTouchAt = Date.now();
    const delayMs = eventType === EF_ALARM ? 150 : 450;
    scheduleUnrecognizedFingerCheck(delayMs, deviceIp);
    return;
  }
}

/**
 * Parses incoming TCP stream frames from the K50 Pro
 */
function handleSocketData(chunk: Buffer) {
  const st = getState();
  st.rxBuffer = Buffer.concat([st.rxBuffer, chunk]);

  while (st.rxBuffer.length >= 16) {
    if (
      st.rxBuffer[0] !== 0x50 ||
      st.rxBuffer[1] !== 0x50 ||
      st.rxBuffer[2] !== 0x82 ||
      st.rxBuffer[3] !== 0x7d
    ) {
      const magicIdx = st.rxBuffer.indexOf(TCP_MAGIC);
      if (magicIdx === -1) {
        st.rxBuffer = Buffer.alloc(0);
        return;
      }
      st.rxBuffer = st.rxBuffer.subarray(magicIdx);
      if (st.rxBuffer.length < 16) return;
    }

    const zkLength = st.rxBuffer.readUInt32LE(4);
    const totalFrameLength = 8 + zkLength;
    if (st.rxBuffer.length < totalFrameLength) {
      return;
    }

    const frame = st.rxBuffer.subarray(0, totalFrameLength);
    st.rxBuffer = st.rxBuffer.subarray(totalFrameLength);

    const cmd = frame.readUInt16LE(8);
    const sId = frame.readUInt16LE(12);
    const rId = frame.readUInt16LE(14);
    const payload = frame.subarray(16);

    // Record raw event for diagnostics
    st.lastRawEvents = [
      {
        time: new Date().toISOString(),
        cmd,
        sId,
        rId,
        payloadHex: payload.subarray(0, 32).toString("hex"),
      },
      ...st.lastRawEvents.slice(0, 19),
    ];

    if (cmd === CMD_ACK_UNAUTH) {
      st.sessionId = sId;
      st.replyId = rId;
      st.lastHeartbeatAt = Date.now();
      const authPayload = makeCommKey(DEFAULT_COMM_KEY, st.sessionId);
      sendZkCommand(CMD_AUTH, authPayload);
    } else if (cmd === CMD_ACK_OK) {
      st.lastHeartbeatAt = Date.now();
      if (!st.isConnected) {
        if (sId !== 0 && st.sessionId === 0) {
          st.sessionId = sId;
        }
        st.isConnected = true;
        st.isConnecting = false;
        console.log(
          `[K50 Pro Manager v${MANAGER_VERSION}] ✓ Connected & Authenticated to ${st.deviceIp}:${st.devicePort} (Session #${st.sessionId})`
        );

        // Subscribe to all real-time events (0xFFFF) and enable verification mode
        const maskBuf = Buffer.alloc(4);
        maskBuf.writeUInt32LE(EVENT_MASK, 0);
        sendZkCommand(CMD_REG_EVENT, maskBuf);
        sendZkCommand(CMD_ENABLEDEVICE);
        sendZkCommand(CMD_STARTVERIFY);
        touchDeviceHeartbeat(true);
      }
    } else if (cmd === CMD_REG_EVENT) {
      st.lastHeartbeatAt = Date.now();
      const eventType = sId;
      // In ZKTeco protocol, ACK real-time events with CMD_ACK_OK, sessionId, replyId=0
      if (st.socket && !st.socket.destroyed) {
        const ackPkt = buildZkTcpPacket(CMD_ACK_OK, st.sessionId, 0);
        st.socket.write(ackPkt);
      }
      handleK50RealTimeEvent(eventType, payload, st.deviceIp);
    }
  }
}

// Auxiliary sockets when a branch has multiple K50 Pro readers (e.g. ZK_DEVICE_IP="192.168.50.201,192.168.50.202")
const auxSockets = new Map<
  string,
  {
    socket: net.Socket | null;
    rxBuffer: Buffer;
    sessionId: number;
    replyId: number;
    isConnected: boolean;
    isConnecting: boolean;
  }
>();

/**
 * Forces every auxiliary reader in the branch back into attendance mode.
 * Called around enrollment so a record session on one K50 Pro never
 * interrupts the ongoing attendance function of the sibling readers.
 */
function forceAuxiliaryDevicesToVerify() {
  if (CONFIGURED_DEVICE_IPS.length <= 1) return;
  let forced = 0;
  for (const ip of CONFIGURED_DEVICE_IPS.slice(1)) {
    const aux = auxSockets.get(ip);
    if (!aux || !aux.socket || aux.socket.destroyed) continue;
    const sendAux = (cmd: number) => {
      if (!aux.socket || aux.socket.destroyed) return;
      aux.replyId = (aux.replyId + 1) % 65530;
      aux.socket.write(buildZkTcpPacket(cmd, aux.sessionId, aux.replyId));
    };
    sendAux(CMD_CANCELCAPTURE);
    sendAux(CMD_STARTVERIFY);
    sendAux(CMD_ENABLEDEVICE);
    forced++;
  }
  if (forced > 0) {
    console.log(
      `[K50 Pro Manager] ${forced} auxiliary reader(s) returned to attendance mode.`
    );
  }
}

function ensureAuxiliaryDevicesConnected() {
  if (CONFIGURED_DEVICE_IPS.length <= 1) return;
  for (const ip of CONFIGURED_DEVICE_IPS.slice(1)) {
    let aux = auxSockets.get(ip);
    if (!aux) {
      aux = {
        socket: null,
        rxBuffer: Buffer.alloc(0),
        sessionId: 0,
        replyId: 0,
        isConnected: false,
        isConnecting: false,
      };
      auxSockets.set(ip, aux);
    }
    if (
      (aux.isConnected && aux.socket && !aux.socket.destroyed) ||
      aux.isConnecting
    ) {
      continue;
    }

    aux.isConnecting = true;
    const sock = new net.Socket();
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 5000);
    aux.socket = sock;
    aux.rxBuffer = Buffer.alloc(0);

    const sendAux = (cmd: number, payload: Buffer = Buffer.alloc(0)) => {
      if (!aux || !aux.socket || aux.socket.destroyed) return;
      aux.replyId = (aux.replyId + 1) % 65530;
      aux.socket.write(buildZkTcpPacket(cmd, aux.sessionId, aux.replyId, payload));
    };

    const connectTimer = setTimeout(() => {
      if (aux && !aux.isConnected) {
        aux.isConnecting = false;
        try {
          sock.destroy();
        } catch {}
      }
    }, 2000);

    sock.connect(DEFAULT_DEVICE_PORT, ip, () => {
      aux!.sessionId = 0;
      aux!.replyId = 0;
      sock.write(buildZkTcpPacket(CMD_CONNECT, 0, 0));
    });

    sock.on("data", (chunk: Buffer) => {
      if (!aux) return;
      aux.rxBuffer = Buffer.concat([aux.rxBuffer, Buffer.from(chunk)]);
      while (aux.rxBuffer.length >= 16) {
        const magicIdx = aux.rxBuffer.indexOf(TCP_MAGIC);
        if (magicIdx === -1) {
          aux.rxBuffer = Buffer.alloc(0);
          return;
        }
        if (magicIdx > 0) aux.rxBuffer = aux.rxBuffer.subarray(magicIdx);
        if (aux.rxBuffer.length < 16) return;

        const zkLen = aux.rxBuffer.readUInt32LE(4);
        const totalLen = 8 + zkLen;
        if (aux.rxBuffer.length < totalLen) return;

        const frame = aux.rxBuffer.subarray(0, totalLen);
        aux.rxBuffer = aux.rxBuffer.subarray(totalLen);

        const cmd = frame.readUInt16LE(8);
        const sId = frame.readUInt16LE(12);
        const rId = frame.readUInt16LE(14);
        const payload = frame.subarray(16);

        if (cmd === CMD_ACK_UNAUTH) {
          aux.sessionId = sId;
          aux.replyId = rId;
          sendAux(CMD_AUTH, makeCommKey(DEFAULT_COMM_KEY, aux.sessionId));
        } else if (cmd === CMD_ACK_OK && !aux.isConnected) {
          clearTimeout(connectTimer);
          if (sId !== 0 && aux.sessionId === 0) aux.sessionId = sId;
          aux.isConnected = true;
          aux.isConnecting = false;
          const maskBuf = Buffer.alloc(4);
          maskBuf.writeUInt32LE(EVENT_MASK, 0);
          sendAux(CMD_REG_EVENT, maskBuf);
          sendAux(CMD_ENABLEDEVICE);
          sendAux(CMD_STARTVERIFY);
        } else if (cmd === CMD_REG_EVENT) {
          if (aux.socket && !aux.socket.destroyed) {
            aux.socket.write(buildZkTcpPacket(CMD_ACK_OK, aux.sessionId, 0));
          }
          handleK50RealTimeEvent(sId, payload, ip);
        }
      }
    });

    sock.on("error", () => {
      clearTimeout(connectTimer);
      if (aux) {
        aux.isConnected = false;
        aux.isConnecting = false;
      }
    });

    sock.on("close", () => {
      clearTimeout(connectTimer);
      if (aux) {
        aux.isConnected = false;
        aux.isConnecting = false;
      }
    });
  }
}

function destroyMainSocket() {
  const st = getState();
  st.isConnected = false;
  st.isConnecting = false;
  st.sessionId = 0;
  if (st.socket) {
    try {
      st.socket.removeAllListeners();
      st.socket.destroy();
    } catch {
      // ignore
    }
    st.socket = null;
  }
}

/**
 * Ensures the Next.js server maintains a live TCP connection to the ZKTeco K50 Pro,
 * actively sends ZKTeco keepalive pings every 8s, and kills zombie sockets if no ACK arrives within 14s.
 */
export function ensureK50Connected(
  branchId?: number,
  openLessonId?: number | null,
  forceReconnect: boolean = false
): {
  connected: boolean;
  deviceIp: string;
  devicePort: number;
} {
  const st = getState();
  if (branchId && branchId > 0) {
    st.branchId = branchId;
  }
  if (openLessonId !== undefined) {
    st.openLessonId = openLessonId && openLessonId > 0 ? openLessonId : null;
  }

  ensureAuxiliaryDevicesConnected();

  const now = Date.now();

  if (forceReconnect) {
    destroyMainSocket();
  }

  // Zombie check: if connected but no response from K50 Pro in 14s, reset the socket!
  if (st.isConnected && st.socket && !st.socket.destroyed) {
    if (st.lastHeartbeatAt > 0 && now - st.lastHeartbeatAt > 14000) {
      console.warn(
        `[K50 Pro Manager] ! Zombie/Idle session detected (>14s without ACK). Resetting connection...`
      );
      destroyMainSocket();
    } else {
      // Send active ZKTeco keepalive every 6s when polled so K50 Pro session never expires
      if (now - st.lastHeartbeatAt > 6000 && !st.enrollment.active) {
        const maskBuf = Buffer.alloc(4);
        maskBuf.writeUInt32LE(EVENT_MASK, 0);
        sendZkCommand(CMD_REG_EVENT, maskBuf);
        sendZkCommand(CMD_ENABLEDEVICE);
      }
      return {
        connected: true,
        deviceIp: st.deviceIp,
        devicePort: st.devicePort,
      };
    }
  }

  if (st.isConnecting) {
    return {
      connected: false,
      deviceIp: st.deviceIp,
      devicePort: st.devicePort,
    };
  }

  st.isConnecting = true;
  if (st.reconnectTimer) {
    clearTimeout(st.reconnectTimer);
    st.reconnectTimer = null;
  }

  try {
    destroyMainSocket();
    st.isConnecting = true;

    const sock = new net.Socket();
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 5000);
    st.socket = sock;
    st.rxBuffer = Buffer.alloc(0);

    // Strict 2.0-second connect timeout so it never hangs in SYN_SENT on Wi-Fi
    const connectTimer = setTimeout(() => {
      if (st.socket === sock && !st.isConnected) {
        destroyMainSocket();
      }
    }, 2000);

    sock.connect(st.devicePort, st.deviceIp, () => {
      if (st.socket !== sock) return;
      st.sessionId = 0;
      st.replyId = 0;
      st.lastHeartbeatAt = Date.now();
      const connectPkt = buildZkTcpPacket(CMD_CONNECT, 0, 0);
      sock.write(connectPkt);
    });

    sock.on("data", (chunk: Buffer) => {
      if (st.socket !== sock) return;
      clearTimeout(connectTimer);
      st.lastHeartbeatAt = Date.now();
      handleSocketData(Buffer.from(chunk));
    });

    sock.on("error", () => {
      clearTimeout(connectTimer);
      if (st.socket === sock) {
        destroyMainSocket();
      }
    });

    sock.on("close", () => {
      clearTimeout(connectTimer);
      if (st.socket === sock) {
        const wasConnected = st.isConnected;
        destroyMainSocket();
        if (wasConnected) {
          touchDeviceHeartbeat(false);
        }
        if (!st.reconnectTimer) {
          st.reconnectTimer = setTimeout(() => {
            st.reconnectTimer = null;
            ensureK50Connected();
          }, 2500);
        }
      }
    });
  } catch {
    st.isConnecting = false;
  }

  return {
    connected: st.isConnected,
    deviceIp: st.deviceIp,
    devicePort: st.devicePort,
  };
}

async function waitForConnection(
  timeoutMs: number = 3000,
  forceFreshIfIdle: boolean = false
): Promise<boolean> {
  const st = getState();
  if (
    forceFreshIfIdle &&
    (!st.isConnected || Date.now() - st.lastHeartbeatAt > 6000)
  ) {
    ensureK50Connected(undefined, undefined, true);
  } else if (st.isConnected && st.socket && !st.socket.destroyed) {
    return true;
  } else {
    ensureK50Connected();
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (st.isConnected && st.socket && !st.socket.destroyed) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return st.isConnected;
}

/**
 * Starts real-time 3-tap fingerprint enrollment on the physical ZKTeco K50 Pro
 */
export async function startK50HardwareEnrollment(params: {
  globalNumber: number;
  studentId?: string | null;
  studentName?: string;
  fingerIndex?: number;
}): Promise<{
  success: boolean;
  message: string;
  enrollment: K50EnrollmentSession;
}> {
  const st = getState();
  const connected = await waitForConnection(3000, true);

  if (!connected || !st.socket || st.socket.destroyed) {
    return {
      success: false,
      message: `Impossible de joindre le lecteur K50 Pro (${st.deviceIp}:${st.devicePort}). Vérifiez le câble réseau.`,
      enrollment: st.enrollment,
    };
  }

  const globalNumber = Number(params.globalNumber);
  const fingerIndex = Number(params.fingerIndex ?? 0);
  const studentName = params.studentName || `Student #${globalNumber}`;

  sendZkCommand(CMD_CANCELCAPTURE);

  const userPkt = buildUser72Packet(
    globalNumber,
    studentName,
    String(globalNumber)
  );
  sendZkCommand(CMD_USER_WRQ, userPkt);

  const delTempBuf = Buffer.alloc(25, 0);
  delTempBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
  delTempBuf.writeUInt8(fingerIndex, 24);
  sendZkCommand(CMD_DELETE_USERTEMP, delTempBuf);

  const enrollBuf = Buffer.alloc(26, 0);
  enrollBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
  enrollBuf.writeUInt8(fingerIndex, 24);
  enrollBuf.writeUInt8(1, 25);
  sendZkCommand(CMD_STARTENROLL, enrollBuf);

  st.enrollment = {
    active: true,
    deviceIp: st.deviceIp,
    globalNumber,
    studentId: params.studentId || null,
    studentName,
    fingerIndex,
    step: 0,
    status: "WAITING_FINGER",
    message: `Posez le doigt 3 fois sur le lecteur K50 Pro (ID #${globalNumber})...`,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Put every OTHER reader of the branch back into attendance mode so
  // enrollment on this one does not interrupt their scanning.
  forceAuxiliaryDevicesToVerify();

  console.log(
    `[K50 Enroll] Started hardware enrollment on K50 Pro #${st.deviceIp} for #${globalNumber} (${studentName})`
  );

  return {
    success: true,
    message: st.enrollment.message,
    enrollment: st.enrollment,
  };
}

export async function cancelK50HardwareEnrollment(): Promise<{
  success: boolean;
}> {
  const st = getState();
  st.enrollment.active = false;
  st.enrollment.deviceIp = null;
  st.enrollment.status = "CANCELLED";
  st.enrollment.updatedAt = Date.now();

  if (st.isConnected && st.socket && !st.socket.destroyed) {
    sendZkCommand(CMD_CANCELCAPTURE);
    sendZkCommand(CMD_STARTVERIFY);
    sendZkCommand(CMD_ENABLEDEVICE);
  }
  forceAuxiliaryDevicesToVerify();
  return { success: true };
}

export async function deleteK50HardwareUser(
  globalNumber: number
): Promise<boolean> {
  const st = getState();
  const connected = await waitForConnection(2500, true);
  if (!connected || !st.socket || !st.isConnected || st.socket.destroyed) {
    return false;
  }

  // 1. Delete fingerprint template for fingerIndex 0
  const delTempBuf = Buffer.alloc(25, 0);
  delTempBuf.write(String(globalNumber).slice(0, 23), 0, 24, "ascii");
  delTempBuf.writeUInt8(0, 24);
  sendZkCommand(CMD_DELETE_USERTEMP, delTempBuf);

  // 2. Delete user record by 2-byte internal UID
  const delBuf = Buffer.alloc(2);
  delBuf.writeUInt16LE(globalNumber & 0xffff, 0);
  sendZkCommand(CMD_DELETE_USER, delBuf);

  // 3. Refresh internal K50 Pro fingerprint cache
  sendZkCommand(CMD_REFRESHDATA);
  console.log(
    `[K50 Pro Hardware] Deleted user & fingerprint #${globalNumber} from device flash memory.`
  );
  return true;
}

export function getK50Status() {
  const st = getState();
  const isAlive =
    st.isConnected &&
    Boolean(st.socket && !st.socket.destroyed) &&
    (st.lastHeartbeatAt === 0 || Date.now() - st.lastHeartbeatAt <= 14000);
  return {
    connected: isAlive,
    deviceIp: st.deviceIp,
    devicePort: st.devicePort,
    enrollment: st.enrollment,
    lastRawEvents: st.lastRawEvents,
  };
}
