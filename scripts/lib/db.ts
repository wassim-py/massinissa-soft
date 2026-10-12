/**
 * scripts/lib/db.ts
 * Shared Prisma client for all CLI and import scripts.
 * Uses PrismaPg adapter + dotenv + URL/SSL normalization, matching src/lib/prisma.ts.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function normalizeDatabaseUrl(): string {
  const raw = (process.env.DATABASE_URL || process.env.DIRECT_URL || '').trim();
  if (!raw) return raw;

  const atIndex = raw.lastIndexOf('@');
  let sanitized = raw;
  if (atIndex !== -1) {
    const prefix = raw.slice(0, atIndex);
    const suffix = raw.slice(atIndex);
    const schemeEnd = prefix.indexOf('://');
    if (schemeEnd !== -1) {
      const userInfo = prefix.slice(schemeEnd + 3);
      const colonIndex = userInfo.indexOf(':');
      if (colonIndex !== -1) {
        const user = userInfo.slice(0, colonIndex);
        const rawPass = userInfo.slice(colonIndex + 1);
        let decodedPass = rawPass;
        try {
          decodedPass = decodeURIComponent(rawPass);
        } catch {
          // keep rawPass
        }
        const encodedPass = encodeURIComponent(decodedPass);
        sanitized = `${prefix.slice(0, schemeEnd + 3)}${user}:${encodedPass}${suffix}`;
      }
    }
  }

  if (sanitized.includes('.pooler.supabase.com')) {
    sanitized = sanitized.replace(':5432/', ':6543/');
  }

  const qIndex = sanitized.indexOf('?');
  if (qIndex !== -1) {
    const base = sanitized.slice(0, qIndex);
    const query = sanitized.slice(qIndex + 1);
    const params = query.split('&').filter((p) => {
      const key = p.split('=')[0]?.toLowerCase();
      return key && key !== 'pgbouncer' && key !== 'sslmode' && key !== 'uselibpqcompat';
    });
    sanitized = params.length > 0 ? `${base}?${params.join('&')}` : base;
  }

  return sanitized;
}

const connectionString = normalizeDatabaseUrl();
const isLocal =
  connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString,
  max: 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

export const prisma = new PrismaClient({ adapter });
