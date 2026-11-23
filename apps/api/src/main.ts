import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 4 * 1024 * 1024 }),
    { bufferLogs: true },
  );

  const config = app.get(AppConfigService);
  await app.register(fastifyCookie, { secret: config.get('AUTH_SESSION_SECRET') });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const webDistCandidates = [
    join(process.cwd(), 'apps', 'web', 'dist'),
    join(process.cwd(), '..', '..', 'apps', 'web', 'dist'),
  ];
  const webDist = webDistCandidates.find((candidate) => existsSync(join(candidate, 'index.html')));
  const indexFile = webDist ? join(webDist, 'index.html') : '';
  const hasWebBuild = Boolean(webDist && indexFile);
  if (hasWebBuild && webDist) {
    await app.register(fastifyStatic, {
      root: join(webDist, 'assets'),
      prefix: '/assets/',
      decorateReply: true,
    });
  }

  await app.init();

  if (hasWebBuild) {
    const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
    const sendIndex = (_request: FastifyRequest, reply: FastifyReply) => {
      reply.type('text/html; charset=utf-8').send(readFileSync(indexFile));
    };
    fastify.get('/', sendIndex);
    fastify.get('/*', (request: FastifyRequest, reply: FastifyReply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/internal/')) {
        reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
        return;
      }
      sendIndex(request, reply);
    });
  }

  const port = config.get('APP_PORT');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Free Welfare API listening on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
