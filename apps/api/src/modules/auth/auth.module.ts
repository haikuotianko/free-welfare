import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityService } from '../../common/security.service';
import { SessionGuard } from '../../common/session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SecurityService, SessionGuard],
  exports: [AuthService, SecurityService, SessionGuard],
})
export class AuthModule {}
