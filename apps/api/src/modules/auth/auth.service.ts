import { Injectable } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { LoginInput, SetupInput } from '@free-welfare/shared';
import { AppConfigService } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { SecurityService } from '../../common/security.service';

export const SESSION_COOKIE = 'fw_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly config: AppConfigService,
  ) {}

  async status(token?: string) {
    const count = await this.prisma.client.admin.count();
    if (count === 0) {
      return { initialized: false, authenticated: false };
    }
    const admin = token ? await this.adminForToken(token) : null;
    return {
      initialized: true,
      authenticated: Boolean(admin),
      admin: admin ? { id: admin.id, username: admin.username } : undefined,
    };
  }

  async setup(input: SetupInput, ip?: string, userAgent?: string) {
    const count = await this.prisma.client.admin.count();
    if (count > 0) {
      throw new AppError('auth_setup_done', '管理员已初始化', 409);
    }
    const admin = await this.prisma.client.admin.create({
      data: {
        username: input.username,
        passwordHash: this.security.hashPassword(input.password),
      },
    });
    const token = await this.createSession(admin.id, ip, userAgent);
    return { token, admin: { id: admin.id, username: admin.username } };
  }

  async login(input: LoginInput, ip?: string, userAgent?: string) {
    const admin = await this.prisma.client.admin.findUnique({
      where: { username: input.username },
    });
    if (!admin || admin.disabled || !this.security.verifyPassword(input.password, admin.passwordHash)) {
      throw new AppError('auth_invalid', '用户名或密码错误', 401);
    }
    const token = await this.createSession(admin.id, ip, userAgent);
    return { token, admin: { id: admin.id, username: admin.username } };
  }

  async logout(token?: string) {
    if (!token) return;
    await this.prisma.client.session.deleteMany({
      where: { tokenHash: this.security.sha256(token) },
    });
  }

  async adminForToken(token: string) {
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: this.security.sha256(token) },
      include: { admin: true },
    });
    if (!session || session.expiresAt <= new Date() || session.admin.disabled) return null;
    return session.admin;
  }

  setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('APP_URL').startsWith('https://'),
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  clearSessionCookie(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  private async createSession(adminId: string, ip?: string, userAgent?: string) {
    const token = this.security.randomToken();
    await this.prisma.client.session.create({
      data: {
        adminId,
        tokenHash: this.security.sha256(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
        ip,
        userAgent,
      },
    });
    return token;
  }
}
