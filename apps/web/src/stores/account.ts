import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api, type AccountOverview } from '../lib/api';

export const useAccountStore = defineStore('account', () => {
  const loaded = ref(false);
  const loading = ref(false);
  const accounts = ref<AccountOverview[]>([]);

  const allSiteAccounts = computed(() =>
    accounts.value.flatMap((account) =>
      account.siteAccounts.map((siteAccount) => ({
        ...siteAccount,
        wechatAccount: {
          id: account.id,
          displayName: account.displayName,
          yybRef: account.yybRef,
          status: account.status,
        },
      })),
    ),
  );

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      accounts.value = await api.get<AccountOverview[]>('/accounts/overview');
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    accounts.value = [];
    loaded.value = false;
  }

  return {
    loaded,
    loading,
    accounts,
    allSiteAccounts,
    load,
    reset,
  };
});
