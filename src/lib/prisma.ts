import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function normalizeDatabaseUrl(): string {
  const raw = (process.env.DATABASE_URL || process.env.DIRECT_URL || '').trim()
  if (!raw) return raw

  // Ensure special characters like '&' in the password portion (before '@') are URL-encoded
  const atIndex = raw.lastIndexOf('@')
  let sanitized = raw
  if (atIndex !== -1) {
    const prefix = raw.slice(0, atIndex)
    const suffix = raw.slice(atIndex)
    const schemeEnd = prefix.indexOf('://')
    if (schemeEnd !== -1) {
      const userInfo = prefix.slice(schemeEnd + 3)
      const colonIndex = userInfo.indexOf(':')
      if (colonIndex !== -1) {
        const user = userInfo.slice(0, colonIndex)
        const rawPass = userInfo.slice(colonIndex + 1)
        // Decode first in case it's already encoded (%26), then encode cleanly
        let decodedPass = rawPass
        try {
          decodedPass = decodeURIComponent(rawPass)
        } catch {
          // keep rawPass
        }
        const encodedPass = encodeURIComponent(decodedPass)
        sanitized = `${prefix.slice(0, schemeEnd + 3)}${user}:${encodedPass}${suffix}`
      }
    }
  }

  // For Supabase pooler in serverless runtime, ALWAYS use Transaction Pooler (:6543)
  // because Session Pooler (:5432) is capped at 15 connections and throws EMAXCONNSESSION on Vercel
  if (sanitized.includes('.pooler.supabase.com')) {
    sanitized = sanitized.replace(':5432/', ':6543/')
  }

  // Strip sslmode and pgbouncer query params so pg-connection-string does not force verify-full
  // on self-signed pooler certificates (we pass ssl: { rejectUnauthorized: false } below)
  const qIndex = sanitized.indexOf('?')
  if (qIndex !== -1) {
    const base = sanitized.slice(0, qIndex)
    const query = sanitized.slice(qIndex + 1)
    const params = query
      .split('&')
      .filter((p) => {
        const key = p.split('=')[0]?.toLowerCase()
        return key && key !== 'pgbouncer' && key !== 'sslmode' && key !== 'uselibpqcompat'
      })
    sanitized = params.length > 0 ? `${base}?${params.join('&')}` : base
  }

  return sanitized
}

const prismaClientSingleton = () => {
  const connectionString = normalizeDatabaseUrl()
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1')

  const adapter = new PrismaPg({
    connectionString,
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  })
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const getPrismaInstance = () => {
  if (globalThis.prismaGlobal) {
    // Recreate if cached instance was created before new models were added
    if (
      !(globalThis.prismaGlobal as any).level ||
      !(globalThis.prismaGlobal as any).missingMoney ||
      !(globalThis.prismaGlobal as any).surplusMoney ||
      !(globalThis.prismaGlobal as any).bookReceipt
    ) {
      globalThis.prismaGlobal = prismaClientSingleton()
    }
    return globalThis.prismaGlobal
  }
  const client = prismaClientSingleton()
  globalThis.prismaGlobal = client
  return client
}

const prisma = getPrismaInstance()

export default prisma

globalThis.prismaGlobal = prisma