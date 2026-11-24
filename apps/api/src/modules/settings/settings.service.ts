import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/config.module';
import { SecurityService } from '../../common/security.service';

export const ONBOARDING_COMPLETED_KEY = 'onboarding.completedAt';
export const DEFAULT_SCRIPT_SOURCE_URL =
  'https://raw.githubusercontent.com/haikuotianko/free-welfare-scripts/main/index.json';

const KEYS = {
  yybBaseUrl: 'yyb.baseUrl',
  yybIntegrationToken: 'yyb.integrationToken',
  yybProtocolToken: 'yyb.protocolToken',
  scriptSourceUrl: 'script.sourceUrl',
  serverchanToken: 'notify.serverchanToken',
  onboardingCompleted: ONBOARDING_COMPLETED_KEY,
} as const;

export interface SettingsUpdate {
  yybBaseUrl?: string;
  yybIntegrationToken?: string;
  yybProtocolToken?: string;
  scriptSourceUrl?: string;
  serverchanToken?: string;
  onboardingCompleted?: boolean;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly config: AppConfigService,
  ) {}

  async getPublic() {
    const yybBaseUrl = await this.getString(KEYS.yybBaseUrl) ?? this.config.get('YYB_BASE_URL');
    const integrationToken = await this.getString(KEYS.yybIntegrationToken) ?? this.config.get('YYB_INTEGRATION_TOKEN');
    const scriptSourceUrl =
      (await this.getString(KEYS.scriptSourceUrl)) ??
      this.config.get('SCRIPT_SOURCE_URL') ??
      DEFAULT_SCRIPT_SOURCE_URL;
    const serverchanToken = await this.getString(KEYS.serverchanToken) ?? this.config.get('SERVERCHAN_TOKEN');
    const onboardingCompleted = Boolean(await this.getString(KEYS.onboardingCompleted));

    return {
      yybBaseUrl: yybBaseUrl ?? '',
      yybConfigured: Boolean(integrationToken),
      scriptSourceUrl,
      serverchanConfigured: Boolean(serverchanToken),
      onboardingCompleted,
    };
  }

  async update(input: SettingsUpdate) {
    const writes: Array<[string, string, boolean]> = [];
    if (input.yybBaseUrl !== undefined) writes.push([KEYS.yybBaseUrl, input.yybBaseUrl, false]);
    if (input.yybIntegrationToken !== undefined) writes.push([KEYS.yybIntegrationToken, input.yybIntegrationToken, true]);
    if (input.yybProtocolToken !== undefined) writes.push([KEYS.yybProtocolToken, input.yybProtocolToken, true]);
    if (input.scriptSourceUrl !== undefined) writes.push([KEYS.scriptSourceUrl, input.scriptSourceUrl, false]);
    if (input.serverchanToken !== undefined) writes.push([KEYS.serverchanToken, input.serverchanToken, true]);

    for (const [key, value, encrypted] of writes) {
      await this.setString(key, value, encrypted);
    }
    if (input.onboardingCompleted !== undefined) {
      if (input.onboardingCompleted) {
        await this.setString(KEYS.onboardingCompleted, new Date().toISOString(), false);
      } else {
        await this.prisma.client.setting.deleteMany({
          where: { key: KEYS.onboardingCompleted },
        });
      }
    }
    return this.getPublic();
  }

  async getYybConfig(): Promise<{
    baseUrl?: string;
    integrationToken?: string;
    protocolToken?: string;
  }> {
    return {
      baseUrl: await this.getString(KEYS.yybBaseUrl) ?? this.config.get('YYB_BASE_URL'),
      integrationToken:
        await this.getString(KEYS.yybIntegrationToken) ?? this.config.get('YYB_INTEGRATION_TOKEN'),
      protocolToken:
        await this.getString(KEYS.yybProtocolToken) ?? this.config.get('YYB_PROTOCOL_TOKEN'),
    };
  }

  async getServerchanToken(): Promise<string | undefined> {
    return (await this.getString(KEYS.serverchanToken)) ?? this.config.get('SERVERCHAN_TOKEN');
  }

  private async getString(key: string): Promise<string | undefined> {
    const row = await this.prisma.client.setting.findUnique({ where: { key } });
    if (!row) return undefined;
    const value = row.value as { value?: string; enc?: string };
    if (row.encrypted && value.enc) return this.security.decrypt(value.enc);
    return value.value;
  }

  private async setString(key: string, value: string, encrypted: boolean) {
    const stored = encrypted
      ? ({ enc: this.security.encrypt(value) } as Prisma.InputJsonValue)
      : ({ value } as Prisma.InputJsonValue);
    await this.prisma.client.setting.upsert({
      where: { key },
      create: { key, value: stored, encrypted },
      update: { value: stored, encrypted },
    });
  }
}
