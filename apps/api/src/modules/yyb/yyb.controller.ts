import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { YybService } from './yyb.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const accountUpdateSchema = z.object({
  timeOffsetMinutes: z.number().int().min(0).max(1440),
});

const requestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().trim().max(60).optional(),
  status: z.enum(['success', 'failed']).optional(),
  account: z.string().trim().max(120).optional(),
  site: z.string().trim().max(120).optional(),
  wechatAccountId: z.string().trim().max(60).optional(),
  siteId: z.string().trim().max(60).optional(),
});

@Controller('api/v1')
@UseGuards(SessionGuard)
export class YybController {
  constructor(private readonly yyb: YybService) {}

  @Get('yyb/health')
  health() {
    return this.yyb.health();
  }

  @Post('yyb/sync')
  sync() {
    return this.yyb.syncAccounts();
  }

  @Get('yyb/requests')
  requests(@Query() query: Record<string, string | undefined>) {
    return this.yyb.listRequests(parseInput(requestQuerySchema, query));
  }

  @Post('yyb/qr')
  createQr() {
    return this.yyb.createQrSession();
  }

  @Get('yyb/qr/:sessionId')
  pollQr(@Param('sessionId') sessionId: string) {
    return this.yyb.pollQrSession(sessionId);
  }

  @Get('accounts')
  accounts() {
    return this.yyb.listAccounts();
  }

  @Get('accounts/overview')
  overview() {
    return this.yyb.overview();
  }

  @Post('accounts/:id/refresh')
  refresh(@Param('id') id: string) {
    return this.yyb.refreshAccount(id);
  }

  @Patch('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() body: unknown) {
    return this.yyb.updateAccount(id, parseInput(accountUpdateSchema, body));
  }
}
