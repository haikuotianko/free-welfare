import { Controller, Get, UseGuards } from '@nestjs/common';
import { PointsService } from './points.service';
import { SessionGuard } from '../../common/session.guard';

@Controller('api/v1/points')
@UseGuards(SessionGuard)
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get()
  list() {
    return this.points.list();
  }
}
