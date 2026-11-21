import { Body, Controller, Delete, Get, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { FilesService } from './files.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const pathSchema = z.object({
  space: z.string().min(1).max(100),
  path: z.string().max(1000).default(''),
});

const writeSchema = pathSchema.extend({
  content: z.string().max(1024 * 1024),
});

const renameSchema = z.object({
  space: z.string().min(1).max(100),
  from: z.string().min(1).max(1000),
  to: z.string().min(1).max(1000),
});

const uploadSchema = pathSchema.extend({
  dataBase64: z.string().min(1).max(3_000_000),
});

@Controller('api/v1/files')
@UseGuards(SessionGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('spaces')
  spaces() {
    return this.files.listSpaces();
  }

  @Get('list')
  list(@Query('space') space: string, @Query('path') path = '') {
    return this.files.list(space, path);
  }

  @Get('content')
  content(@Query('space') space: string, @Query('path') path: string) {
    return this.files.readText(space, path);
  }

  @Put('content')
  write(@Body() body: unknown) {
    const input = parseInput(writeSchema, body);
    return this.files.writeText(input.space, input.path, input.content);
  }

  @Post('directory')
  directory(@Body() body: unknown) {
    const input = parseInput(pathSchema, body);
    return this.files.createDirectory(input.space, input.path);
  }

  @Post('rename')
  rename(@Body() body: unknown) {
    const input = parseInput(renameSchema, body);
    return this.files.renameEntry(input.space, input.from, input.to);
  }

  @Delete()
  remove(@Query('space') space: string, @Query('path') path: string) {
    return this.files.deleteEntry(space, path);
  }

  @Get('download')
  async download(
    @Query('space') space: string,
    @Query('path') path: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.files.readBinary(space, path);
    reply
      .header('Content-Type', file.contentType)
      .header('X-Content-Type-Options', 'nosniff')
      .header(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
    return reply.send(file.data);
  }

  @Post('upload')
  upload(@Body() body: unknown) {
    const input = parseInput(uploadSchema, body);
    return this.files.upload(input.space, input.path, input.dataBase64);
  }
}
