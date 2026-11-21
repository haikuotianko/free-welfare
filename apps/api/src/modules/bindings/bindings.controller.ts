import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { BindingsService } from './bindings.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const createSchema = z.object({
  siteId: z.string().min(1),
  siteAccountId: z.string().min(1),
  scriptId: z.string().min(1),
  config: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

@Controller('api/v1/bindings')
@UseGuards(SessionGuard)
export class BindingsController {
  constructor(private readonly bindings: BindingsService) {}

  @Get()
  list() {
    return this.bindings.list();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.bindings.create(parseInput(createSchema, body));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.bindings.update(id, parseInput(updateSchema, body));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bindings.remove(id);
  }
}
