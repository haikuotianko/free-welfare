import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClockController } from './clock.controller';
import { ClockService } from './clock.service';

@Module({
  imports: [AuthModule],
  controllers: [ClockController],
  providers: [ClockService],
  exports: [ClockService],
})
export class ClockModule {}
