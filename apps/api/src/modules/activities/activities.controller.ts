import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { activityParticipateSchema, ActivitiesService } from './activities.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

@Controller('api/v1/activities')
@UseGuards(SessionGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list() {
    return this.activities.list();
  }

  @Post(':id/participate')
  participate(@Param('id') id: string, @Body() body: unknown) {
    return this.activities.participate(id, parseInput(activityParticipateSchema, body));
  }
}
