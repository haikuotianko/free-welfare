import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScriptsController } from './scripts.controller';
import { ScriptsService } from './scripts.service';

@Module({
  imports: [AuthModule],
  controllers: [ScriptsController],
  providers: [ScriptsService],
  exports: [ScriptsService],
})
export class ScriptsModule {}
