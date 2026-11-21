import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}
