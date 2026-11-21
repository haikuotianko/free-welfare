import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ScriptsService } from './scripts.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const sourceSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z.string().min(1).max(1000).default('local://apps'),
  branch: z.string().default('main'),
  indexUrl: z.string().min(1).max(1000),
  trustLevel: z.enum(['official', 'community', 'custom']).default('official'),
});

const installSchema = z.object({
  version: z.string().min(1).max(50).optional(),
});

const rollbackSchema = z.object({
  version: z.string().min(1).max(50),
});

const statusSchema = z.object({
  status: z.enum(['active', 'disabled', 'available']),
});

@Controller('api/v1')
@UseGuards(SessionGuard)
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Get('scripts')
  list() {
    return this.scripts.list();
  }

  @Get('scripts/:id')
  get(@Param('id') id: string) {
    return this.scripts.get(id);
  }

  @Get('scripts/:id/versions')
  versions(@Param('id') id: string) {
    return this.scripts.versions(id);
  }

  @Post('scripts/:id/install')
  install(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(installSchema, body ?? {});
    return this.scripts.install(id, input.version);
  }

  @Post('scripts/:id/update')
  update(@Param('id') id: string) {
    return this.scripts.update(id);
  }

  @Post('scripts/:id/rollback')
  rollback(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(rollbackSchema, body);
    return this.scripts.rollback(id, input.version);
  }

  @Patch('scripts/:id')
  setStatus(@Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(statusSchema, body);
    return this.scripts.setStatus(id, input.status);
  }

  @Get('script-sources')
  sources() {
    return this.scripts.sources();
  }

  @Post('script-sources')
  createSource(@Body() body: unknown) {
    return this.scripts.createSource(parseInput(sourceSchema, body));
  }

  @Post('script-sources/:id/sync')
  syncSource(@Param('id') id: string) {
    return this.scripts.syncSource(id);
  }

  @Get('script-sources/:id/available')
  available(@Param('id') id: string) {
    return this.scripts.available(id);
  }
}
