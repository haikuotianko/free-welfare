import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import SetupPage from './pages/SetupPage.vue';
import LoginPage from './pages/LoginPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import AccountsPage from './pages/AccountsPage.vue';
import SitesPage from './pages/SitesPage.vue';
import SiteDetailPage from './pages/SiteDetailPage.vue';
import AppStorePage from './pages/AppStorePage.vue';
import TimeSettingsPage from './pages/TimeSettingsPage.vue';
import FormsPage from './pages/FormsPage.vue';
import ProductsPage from './pages/ProductsPage.vue';
import ActivitiesPage from './pages/ActivitiesPage.vue';
import NotificationsPage from './pages/NotificationsPage.vue';
import OrdersPage from './pages/OrdersPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import FilesPage from './pages/FilesPage.vue';
import RunsPage from './pages/RunsPage.vue';
import YybRequestsPage from './pages/YybRequestsPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import SdkDocsPage from './pages/SdkDocsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, top: 80, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    { path: '/setup', name: 'setup', component: SetupPage, meta: { public: true, title: '初始化' } },
    { path: '/login', name: 'login', component: LoginPage, meta: { public: true, title: '登录' } },
    { path: '/', name: 'dashboard', component: DashboardPage, meta: { title: '总览' } },
    { path: '/accounts', name: 'accounts', component: AccountsPage, meta: { title: '账号' } },
    { path: '/sites', name: 'sites', component: SitesPage, meta: { title: '应用' } },
    { path: '/store', name: 'store', component: AppStorePage, meta: { title: '应用商店' } },
    { path: '/time', name: 'time', component: TimeSettingsPage, meta: { title: '时间设置' } },
    { path: '/forms', name: 'forms', component: FormsPage, meta: { title: '表单配置' } },
    { path: '/sites/:id', name: 'site-detail', component: SiteDetailPage, meta: { title: '应用详情' } },
    { path: '/products', name: 'products', component: ProductsPage, meta: { title: '商品' } },
    { path: '/activities', name: 'activities', component: ActivitiesPage, meta: { title: '活动' } },
    { path: '/notifications', name: 'notifications', component: NotificationsPage, meta: { title: '通知' } },
    { path: '/orders', name: 'orders', component: OrdersPage, meta: { title: '兑换记录' } },
    { path: '/files', name: 'files', component: FilesPage, meta: { title: '文件' } },
    { path: '/runs', name: 'runs', component: RunsPage, meta: { title: '运行' } },
    { path: '/yyb-requests', name: 'yyb-requests', component: YybRequestsPage, meta: { title: 'YYB 请求' } },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { title: '设置' } },
    { path: '/sdk', name: 'sdk-docs', component: SdkDocsPage, meta: { title: 'SDK 文档' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage, meta: { title: '页面不存在' } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) await auth.load();

  if (!auth.initialized) {
    return to.name === 'setup' ? true : { name: 'setup' };
  }
  if (!auth.admin) {
    return to.meta.public ? true : { name: 'login' };
  }
  if (to.name === 'setup' || to.name === 'login') {
    return { name: 'dashboard' };
  }
  return true;
});
