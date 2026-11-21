import { Module } from '@nestjs/common';
import { ActivitiesModule } from './modules/activities/activities.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { YybModule } from './modules/yyb/yyb.module';
import { SitesModule } from './modules/sites/sites.module';
import { ScriptsModule } from './modules/scripts/scripts.module';
import { FilesModule } from './modules/files/files.module';
import { BindingsModule } from './modules/bindings/bindings.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { RunsModule } from './modules/runs/runs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PointsModule } from './modules/points/points.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AppStoreModule } from './modules/app-store/app-store.module';
import { ClockModule } from './modules/clock/clock.module';
import { FormsModule } from './modules/forms/forms.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    QueueModule,
    ActivitiesModule,
    DashboardModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    YybModule,
    SitesModule,
    ScriptsModule,
    FilesModule,
    BindingsModule,
    TasksModule,
    RunsModule,
    NotificationsModule,
    PointsModule,
    ProductsModule,
    OrdersModule,
    AppStoreModule,
    ClockModule,
    FormsModule,
  ],
})
export class AppModule {}
