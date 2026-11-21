import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SitesController } from './sites.controller';
import { SiteScriptsController } from './site-scripts.controller';
import { AppScriptsController } from './app-scripts.controller';
import { SiteScriptsService } from './site-scripts.service';
import { SitesService } from './sites.service';

@Module({
  imports: [AuthModule],
  controllers: [SitesController, SiteScriptsController, AppScriptsController],
  providers: [SitesService, SiteScriptsService],
  exports: [SitesService, SiteScriptsService],
})
export class SitesModule {}
