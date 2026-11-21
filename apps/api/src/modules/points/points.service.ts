import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.siteAccount.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        site: true,
        wechatAccount: true,
        pointAccount: true,
      },
    });
  }
}
