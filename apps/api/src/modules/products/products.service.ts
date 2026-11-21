import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  list(kind?: string) {
    return this.prisma.client.product.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ pointsCost: 'asc' }, { lastSeenAt: 'desc' }],
      include: { site: true },
    });
  }

  async syncGrab() {
    const scripts = await this.prisma.client.siteScript.findMany({
      where: { enabled: true, filePath: 'grab.js' },
      include: { site: { include: { siteAccounts: true } } },
    });
    let queued = 0;
    for (const script of scripts) {
      for (const account of script.site.siteAccounts) {
        await this.queue.enqueue({
          siteScriptId: script.id,
          siteId: script.siteId,
          siteAccountId: account.id,
        });
        queued += 1;
      }
    }
    return { queued };
  }
}
