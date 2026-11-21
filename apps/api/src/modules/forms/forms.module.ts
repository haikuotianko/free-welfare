import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountFormsController, FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [AuthModule],
  controllers: [FormsController, AccountFormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
