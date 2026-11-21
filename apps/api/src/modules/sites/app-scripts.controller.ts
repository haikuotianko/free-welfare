import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SessionGuard } from '../../common/session.guard';

@Controller('api/v1/app-scripts')
@UseGuards(SessionGuard)
export class AppScriptsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.client.siteScript.findMany({
      orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }],
      include: {
        site: {
          select: {
            id: true,
            key: true,
            name: true,
            iconUrl: true,
            pointsName: true,
          },
        },
      },
    });
  }
}
