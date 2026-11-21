import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@free-welfare/db';
import { AppError } from './app-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof AppError) {
      reply.status(exception.status).send({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: '请求参数不合法',
          details: exception.flatten(),
        },
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        reply.status(409).send({ error: { code: 'conflict', message: '数据已存在' } });
        return;
      }
      if (exception.code === 'P2025') {
        reply.status(404).send({ error: { code: 'not_found', message: '数据不存在' } });
        return;
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      reply.status(status).send({
        error: {
          code: status === 401 ? 'auth_required' : 'http_error',
          message: exception.message,
        },
      });
      return;
    }

    console.error(exception);
    reply.status(500).send({
      error: {
        code: 'system_error',
        message: '服务器内部错误',
      },
    });
  }
}
