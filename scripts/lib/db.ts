/**
 * scripts/lib/db.ts
 * Shared Prisma client for all import scripts.
 * Uses PrismaPg adapter + dotenv, same pattern as src/lib/prisma.ts.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
