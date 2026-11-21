import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SessionGuard } from '../../common/session.guard';

@Controller('api/v1/orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list() {
    return this.orders.list();
  }
}
