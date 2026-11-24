import { defineStore } from 'pinia';
import { api, type Admin, type AuthStatus } from '../lib/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    loaded: false,
    initialized: false,
    onboardingCompleted: false,
    admin: null as Admin | null,
  }),
  actions: {
    async load() {
      const status = await api.get<AuthStatus>('/auth/status');
      this.initialized = status.initialized;
      this.onboardingCompleted = status.onboardingCompleted;
      this.admin = status.admin ?? null;
      this.loaded = true;
    },
    async setup(username: string, password: string) {
      const result = await api.post<{ admin: Admin; onboardingCompleted: boolean }>('/auth/setup', { username, password });
      this.initialized = true;
      this.admin = result.admin;
      this.onboardingCompleted = false;
      this.loaded = true;
    },
    async login(username: string, password: string) {
      const result = await api.post<{ admin: Admin; onboardingCompleted: boolean }>('/auth/login', { username, password });
      this.admin = result.admin;
      this.onboardingCompleted = result.onboardingCompleted;
      this.loaded = true;
    },
    markOnboardingCompleted() {
      this.onboardingCompleted = true;
    },
    async logout() {
      await api.post('/auth/logout');
      this.admin = null;
      this.onboardingCompleted = false;
    },
  },
});
