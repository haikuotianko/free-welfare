import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        site: true,
        siteAccount: { include: { wechatAccount: true } },
      },
    });
  }
}
