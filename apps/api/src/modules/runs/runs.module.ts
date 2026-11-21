import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [AuthModule],
  controllers: [RunsController],
  providers: [RunsService, RunEventsService],
  exports: [RunsService, RunEventsService],
})
export class RunsModule {}
