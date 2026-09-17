import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prismaClientSingleton = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
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
  if (process.env.NODE_ENV !== 'production') {
    globalThis.prismaGlobal = client
  }
  return client
}

const prisma = getPrismaInstance()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma