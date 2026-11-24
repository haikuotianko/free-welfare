import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AppStoreService } from './app-store.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const sourceSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z.string().min(1).max(1000).default('local://apps'),
  branch: z.string().default('main'),
  indexUrl: z.string().min(1).max(1000),
  trustLevel: z.enum(['official', 'community', 'custom']).default('official'),
});

const testSourceSchema = z.object({
  indexUrl: z.string().trim().min(1).max(1000),
});

const installSchema = z.object({
  bindAll: z.boolean().default(false),
  enableScripts: z.boolean().default(false),
});

@Controller('api/v1/app-store')
@UseGuards(SessionGuard)
export class AppStoreController {
  constructor(private readonly store: AppStoreService) {}

  @Get('sources')
  sources() {
    return this.store.sources();
  }

  @Post('sources')
  createSource(@Body() body: unknown) {
    return this.store.createSource(parseInput(sourceSchema, body));
  }

  @Post('sources/test')
  testSource(@Body() body: unknown) {
    return this.store.testSource(parseInput(testSourceSchema, body).indexUrl);
  }

  @Post('sources/:id/sync')
  syncSource(@Param('id') id: string) {
    return this.store.syncSource(id);
  }

  @Delete('sources/:id')
  removeSource(@Param('id') id: string) {
    return this.store.removeSource(id);
  }

  @Get('apps')
  apps(
    @Query('q') q?: string,
    @Query('sourceId') sourceId?: string,
    @Query('installed') installed?: string,
    @Query('category') category?: string,
  ) {
    return this.store.apps({
      q,
      sourceId,
      category,
      installed:
        installed === 'true' ? true : installed === 'false' ? false : undefined,
    });
  }

  @Get('apps/:id')
  app(@Param('id') id: string) {
    return this.store.app(id);
  }

  @Post('apps/:id/install')
  install(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(installSchema, body ?? {});
    return this.store.install(id, input.bindAll, false, input.enableScripts);
  }

  @Post('apps/:id/update')
  update(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(installSchema, body ?? {});
    return this.store.update(id, input.bindAll);
  }
}
