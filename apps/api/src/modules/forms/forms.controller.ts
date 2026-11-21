import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  accountFormValuesSchema,
  formTemplateSchema,
  formTemplateUpdateSchema,
  FormsService,
} from './forms.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

@Controller('api/v1/forms')
@UseGuards(SessionGuard)
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  list() {
    return this.forms.list();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.forms.create(parseInput(formTemplateSchema, body));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.forms.update(id, parseInput(formTemplateUpdateSchema, body));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.forms.remove(id);
  }
}

@Controller('api/v1/accounts')
@UseGuards(SessionGuard)
export class AccountFormsController {
  constructor(private readonly forms: FormsService) {}

  @Get(':id/forms')
  list(@Param('id') id: string) {
    return this.forms.accountForms(id);
  }

  @Put(':id/forms/:templateId')
  save(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(accountFormValuesSchema, body);
    return this.forms.saveAccountForm(id, templateId, input.values);
  }

  @Delete(':id/forms/:templateId')
  remove(@Param('id') id: string, @Param('templateId') templateId: string) {
    return this.forms.removeAccountForm(id, templateId);
  }
}
