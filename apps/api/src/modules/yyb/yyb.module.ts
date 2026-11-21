import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { YybController } from './yyb.controller';
import { YybService } from './yyb.service';

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [YybController],
  providers: [YybService],
  exports: [YybService],
})
export class YybModule {}
