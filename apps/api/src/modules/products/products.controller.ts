import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { SessionGuard } from '../../common/session.guard';

@Controller('api/v1/products')
@UseGuards(SessionGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query('kind') kind?: string) {
    return this.products.list(kind);
  }

  @Post('sync')
  syncGrab() {
    return this.products.syncGrab();
  }
}
