import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScriptsModule } from '../scripts/scripts.module';
import { AppStoreController } from './app-store.controller';
import { AppStoreService } from './app-store.service';

@Module({
  imports: [AuthModule, ScriptsModule],
  controllers: [AppStoreController],
  providers: [AppStoreService],
  exports: [AppStoreService],
})
export class AppStoreModule {}
