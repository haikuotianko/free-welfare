import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SessionGuard } from '../../common/session.guard';

@Controller('api/v1/dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@Query('accountId') accountId?: string) {
    return this.dashboard.summary(accountId);
  }
}
