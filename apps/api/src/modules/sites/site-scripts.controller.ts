import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CAPABILITIES, DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { z } from 'zod';
import { SiteScriptsService } from './site-scripts.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const scriptSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(''),
  filePath: z.string().min(1).max(300),
  args: z.string().max(500).default(''),
  cron: z.string().max(100).default(''),
  timezone: z.string().min(1).max(64).default(DEFAULT_TIMEZONE),
  capabilities: z.array(z.enum(CAPABILITIES)).default([]),
  enabled: z.boolean().default(true),
});

const scriptUpdateSchema = scriptSchema.partial();

const fileWriteSchema = z.object({
  path: z.string().min(1).max(300),
  content: z.string().max(512 * 1024),
});

const runSchema = z.object({
  accountId: z.string().min(1).optional(),
});

@Controller('api/v1/sites/:siteId')
@UseGuards(SessionGuard)
export class SiteScriptsController {
  constructor(private readonly scripts: SiteScriptsService) {}

  @Get('scripts')
  list(@Param('siteId') siteId: string) {
    return this.scripts.list(siteId);
  }

  @Post('scripts')
  create(@Param('siteId') siteId: string, @Body() body: unknown) {
    return this.scripts.create(siteId, parseInput(scriptSchema, body));
  }

  @Patch('scripts/:scriptId')
  update(
    @Param('siteId') siteId: string,
    @Param('scriptId') scriptId: string,
    @Body() body: unknown,
  ) {
    return this.scripts.update(siteId, scriptId, parseInput(scriptUpdateSchema, body));
  }

  @Delete('scripts/:scriptId')
  remove(@Param('siteId') siteId: string, @Param('scriptId') scriptId: string) {
    return this.scripts.remove(siteId, scriptId);
  }

  @Post('scripts/:scriptId/run')
  run(
    @Param('siteId') siteId: string,
    @Param('scriptId') scriptId: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(runSchema, body ?? {});
    return this.scripts.run(siteId, scriptId, input.accountId);
  }

  @Get('script-files')
  files(@Param('siteId') siteId: string) {
    return this.scripts.listFiles(siteId);
  }

  @Get('script-files/content')
  readFile(@Param('siteId') siteId: string, @Query('path') path: string) {
    return this.scripts.readFile(siteId, path);
  }

  @Put('script-files/content')
  writeFile(@Param('siteId') siteId: string, @Body() body: unknown) {
    const input = parseInput(fileWriteSchema, body);
    return this.scripts.writeFile(siteId, input.path, input.content);
  }

  @Delete('script-files')
  deleteFile(@Param('siteId') siteId: string, @Query('path') path: string) {
    return this.scripts.deleteFile(siteId, path);
  }
}
