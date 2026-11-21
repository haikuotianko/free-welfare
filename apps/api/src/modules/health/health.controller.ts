import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let database = 'ok';
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    return {
      ok: database === 'ok',
      service: 'free-welfare-api',
      version: '0.1.0',
      database,
      time: new Date().toISOString(),
    };
  }
}
