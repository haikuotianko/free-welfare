import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  networkConfigSchema,
  siteCreateSchema,
  siteEnvUpdateSchema,
  siteUpdateSchema,
} from '@free-welfare/shared';
import { z } from 'zod';
import { SitesService } from './sites.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const iconUploadSchema = z.object({
  dataUrl: z.string().min(1).max(1_500_000),
});

const bindAccountSchema = z.object({
  wechatAccountId: z.string().min(1),
});

const accountBindingUpdateSchema = z.object({
  disabled: z.boolean().optional(),
  envVars: z.record(z.string(), z.string()).optional(),
});

@Controller('api/v1/sites')
@UseGuards(SessionGuard)
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list() {
    return this.sites.list();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.sites.create(parseInput(siteCreateSchema, body));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.sites.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.sites.update(id, parseInput(siteUpdateSchema, body));
  }

  @Post(':id/accounts')
  bindAccount(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(bindAccountSchema, body);
    return this.sites.bindAccount(id, input.wechatAccountId);
  }

  @Delete(':id/accounts/:accountId')
  unbindAccount(@Param('id') id: string, @Param('accountId') accountId: string) {
    return this.sites.unbindAccount(id, accountId);
  }

  @Patch(':id/accounts/:accountId')
  updateAccountBinding(
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    return this.sites.updateAccountBinding(
      id,
      accountId,
      parseInput(accountBindingUpdateSchema, body),
    );
  }

  @Post(':id/accounts/:accountId/refresh')
  refreshAccountStatus(
    @Param('id') id: string,
    @Param('accountId') accountId: string,
  ) {
    return this.sites.refreshAccountStatus(id, accountId);
  }

  @Put(':id/network')
  updateNetwork(@Param('id') id: string, @Body() body: unknown) {
    return this.sites.updateNetwork(id, parseInput(networkConfigSchema, body));
  }

  @Get(':id/icon-files')
  iconFiles(@Param('id') id: string) {
    return this.sites.listIconFiles(id);
  }

  @Get(':id/env')
  env(@Param('id') id: string) {
    return this.sites.listEnv(id);
  }

  @Put(':id/env')
  updateEnv(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(siteEnvUpdateSchema, body);
    return this.sites.updateEnv(id, input.vars);
  }

  @Get(':id/icon')
  async icon(
    @Param('id') id: string,
    @Query('path') path: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const icon = await this.sites.readIcon(id, path);
    reply
      .header('Cache-Control', 'private, max-age=300')
      .header('X-Content-Type-Options', 'nosniff')
      .type(icon.contentType);
    if (icon.contentType === 'image/svg+xml') {
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    }
    return reply.send(icon.data);
  }

  @Put(':id/icon')
  uploadIcon(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(iconUploadSchema, body);
    return this.sites.uploadIcon(id, input.dataUrl);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sites.remove(id);
  }
}
