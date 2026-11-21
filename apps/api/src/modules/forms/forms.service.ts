import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';

export const formFieldSchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '字段 key 不合法'),
  label: z.string().min(1).max(80),
  type: z.enum(['text', 'tel', 'number', 'date', 'textarea', 'select', 'address']).default('text'),
  defaultValue: z.string().max(500).default(''),
  note: z.string().max(500).default(''),
  required: z.boolean().default(false),
  options: z.array(z.string().max(100)).default([]),
});

export const formTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  fields: z.array(formFieldSchema).min(1).max(50),
});

export const formTemplateUpdateSchema = formTemplateSchema.partial();

export const accountFormValuesSchema = z.object({
  values: z.record(z.string().max(2000)),
});

type FormField = z.infer<typeof formFieldSchema>;

function normalizeValues(fields: FormField[], values: Record<string, string>) {
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    result[field.key] = value === undefined || value === null
      ? field.defaultValue || ''
      : String(value);
  }
  return result;
}

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.formTemplate.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { accountForms: true } } },
    });
  }

  async get(id: string) {
    const template = await this.prisma.client.formTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError('not_found', '表单不存在', 404);
    return template;
  }

  create(input: z.infer<typeof formTemplateSchema>) {
    return this.prisma.client.formTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        fields: input.fields as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, input: z.infer<typeof formTemplateUpdateSchema>) {
    await this.get(id);
    const data: Prisma.FormTemplateUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.fields !== undefined) data.fields = input.fields as Prisma.InputJsonValue;
    return this.prisma.client.formTemplate.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.client.formTemplate.delete({ where: { id } });
    return { ok: true };
  }

  async accountForms(accountId: string) {
    await this.getAccount(accountId);
    return this.prisma.client.accountForm.findMany({
      where: { wechatAccountId: accountId },
      orderBy: { createdAt: 'asc' },
      include: { template: true },
    });
  }

  async saveAccountForm(
    accountId: string,
    templateId: string,
    values: Record<string, string>,
  ) {
    await this.getAccount(accountId);
    const template = await this.get(templateId);
    const fields = Array.isArray(template.fields)
      ? (template.fields as unknown as FormField[])
      : [];
    const normalized = normalizeValues(fields, values || {});
    return this.prisma.client.accountForm.upsert({
      where: {
        wechatAccountId_templateId: {
          wechatAccountId: accountId,
          templateId,
        },
      },
      create: {
        wechatAccountId: accountId,
        templateId,
        values: normalized as Prisma.InputJsonValue,
      },
      update: { values: normalized as Prisma.InputJsonValue },
      include: { template: true },
    });
  }

  async removeAccountForm(accountId: string, templateId: string) {
    await this.getAccount(accountId);
    const deleted = await this.prisma.client.accountForm.deleteMany({
      where: { wechatAccountId: accountId, templateId },
    });
    if (deleted.count === 0) throw new AppError('not_found', '账号没有这个表单', 404);
    return { ok: true };
  }

  private async getAccount(id: string) {
    const account = await this.prisma.client.wechatAccount.findUnique({ where: { id } });
    if (!account) throw new AppError('not_found', '账号不存在', 404);
    return account;
  }
}
