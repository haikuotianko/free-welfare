import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api, type AccountOverview } from '../lib/api';

export const useAccountStore = defineStore('account', () => {
  const loaded = ref(false);
  const loading = ref(false);
  const accounts = ref<AccountOverview[]>([]);
  const selectedId = ref(localStorage.getItem('fw-account') || '');

  const selectedAccount = computed(
    () => accounts.value.find((account) => account.id === selectedId.value) ?? null,
  );

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
      const list = await api.get<AccountOverview[]>('/accounts/overview');
      accounts.value = list.map((account) => ({
        ...account,
        displayName: account.alias || account.displayName,
      }));
      const selected = accounts.value.find((account) => account.id === selectedId.value);
      if (selectedId.value && (!selected || selected.disabled)) {
        selectedId.value = '';
        localStorage.removeItem('fw-account');
      }
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function select(id: string) {
    selectedId.value = id;
    if (id) localStorage.setItem('fw-account', id);
    else localStorage.removeItem('fw-account');
  }

  function reset() {
    accounts.value = [];
    selectedId.value = '';
    loaded.value = false;
    localStorage.removeItem('fw-account');
  }

  return {
    loaded,
    loading,
    accounts,
    selectedId,
    selectedAccount,
    allSiteAccounts,
    load,
    select,
    reset,
  };
});
