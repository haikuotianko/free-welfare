import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  console.log('Free Welfare worker started');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
