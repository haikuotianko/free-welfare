import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@free-welfare/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
