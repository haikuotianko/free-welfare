import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppError } from './app-error';
import { PrismaService } from '../database/prisma.service';
import { SecurityService } from './security.service';

export interface AdminPrincipal {
  id: string;
  username: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  admin?: AdminPrincipal;
  sessionId?: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.['fw_session'];
    if (!token) throw new AppError('auth_required', '请先登录', 401);

    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: this.security.sha256(token) },
      include: { admin: true },
    });

    if (!session || session.expiresAt <= new Date() || session.admin.disabled) {
      throw new AppError('auth_required', '登录已失效', 401);
    }

    request.admin = { id: session.admin.id, username: session.admin.username };
    request.sessionId = session.id;
    return true;
  }
}
