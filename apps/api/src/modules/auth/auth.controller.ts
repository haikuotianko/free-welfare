import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema, setupSchema } from '@free-welfare/shared';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { parseInput } from '../../common/validate';
import { SessionGuard, type AuthenticatedRequest } from '../../common/session.guard';
import { CurrentAdmin } from '../../common/current-admin.decorator';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('status')
  async status(@Req() request: FastifyRequest) {
    const token = request.cookies?.[SESSION_COOKIE];
    return this.auth.status(token);
  }

  @Post('setup')
  async setup(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(setupSchema, body);
    const result = await this.auth.setup(input, request.ip, request.headers['user-agent']);
    this.auth.setSessionCookie(reply, result.token);
    return { admin: result.admin };
  }

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(loginSchema, body);
    const result = await this.auth.login(input, request.ip, request.headers['user-agent']);
    this.auth.setSessionCookie(reply, result.token);
    return { admin: result.admin };
  }

  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE]);
    this.auth.clearSessionCookie(reply);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentAdmin() admin: { id: string; username: string }) {
    return { admin };
  }
}
