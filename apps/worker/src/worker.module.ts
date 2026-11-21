import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { RunnerService } from './runner/runner.service';

@Module({
  imports: [DatabaseModule],
  providers: [RunnerService],
})
export class WorkerModule {}
