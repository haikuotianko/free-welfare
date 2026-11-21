import { Global, Injectable, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env';

@Injectable()
export class AppConfigService {
  private readonly env = loadEnv();

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}

@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
