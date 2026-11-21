<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next';

const sections = [
  { id: 'quick-start', label: '快速开始' },
  { id: 'context', label: 'Context 一览' },
  { id: 'errors', label: '日志与错误详情' },
  { id: 'login-yyb', label: '登录与 YYB' },
  { id: 'http-cache', label: 'HTTP / 缓存 / 配置' },
  { id: 'data-api', label: '商品 / 积分 / 订单' },
  { id: 'activity-form', label: '活动表单与输入' },
  { id: 'notify', label: '通知 / 产物 / 状态' },
  { id: 'return', label: '返回值' },
];

const contextRows = [
  ['ctx.run / ctx.runId', '当前运行信息、脚本信息、输入 input'],
  ['ctx.args', '脚本参数数组，例如 ctx.args.includes("--confirm")'],
  ['ctx.input', '活动参加、一键注册等运行输入'],
  ['ctx.app / ctx.site', '应用信息、配置、环境变量'],
  ['ctx.account', '当前微信账号、加密 session 读写'],
  ['ctx.user', '用户资料、手机号、积分'],
  ['ctx.yyb', 'YYB 取 code、手机号授权、账号状态'],
  ['ctx.http', '带白名单、超时、重试的 HTTP 客户端'],
  ['ctx.cache', 'run / account / app 三级缓存'],
  ['ctx.log', '结构化日志、进度、子 logger'],
  ['ctx.crypto', 'MD5 / HMAC / Base64 / AES / RSA'],
  ['ctx.products / ctx.grab', '商品、抢购商品的同步与状态'],
  ['ctx.points', '积分同步、增减、流水、批次'],
  ['ctx.activities', '活动同步、参加表单 formSchema'],
  ['ctx.orders', '兑换/抢购订单记录'],
  ['ctx.notify', '通知记录与 Server酱'],
  ['ctx.artifacts', '截图、JSON、日志等产物'],
  ['ctx.state', '按账号持久化的脚本状态'],
  ['ctx.time', '平台时间、sleep、sleepUntil'],
  ['ctx.retry / sleep / assert / fail', '通用工具方法'],
];
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <BookOpen class="h-5 w-5 text-brand-600" /> 脚本 SDK 文档
        </h2>
        <p class="text-sm text-slate-500">
          应用脚本通过平台注入的 ctx 访问账号、HTTP、积分、商品、活动、通知等能力。
        </p>
      </div>
      <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">CommonJS · { run(ctx) }</span>
    </div>

    <div class="grid gap-4 lg:grid-cols-[13rem_1fr]">
      <aside class="card hidden h-fit lg:block">
        <div class="mb-2 text-xs font-semibold text-slate-500">目录</div>
        <nav class="space-y-1">
          <a
            v-for="section in sections"
            :key="section.id"
            :href="`#${section.id}`"
            class="block rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {{ section.label }}
          </a>
        </nav>
        <div class="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500 dark:border-slate-800">
          完整原文：<code>docs/19-script-sdk.md</code><br />
          示例指南：<code>docs/20-script-development-guide.md</code>
        </div>
      </aside>

      <div class="min-w-0 space-y-4">
        <section id="quick-start" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">快速开始</h3>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            一个脚本导出 <code>run(ctx)</code>；返回 <code>ok: false</code> 表示业务失败，抛出的错误会记录到运行详情。
          </p>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">module.exports = {
  async run(ctx) {
    ctx.log.step('检查登录状态');

    const session = await ctx.account.session.get();
    if (!session?.token) {
      const code = await ctx.yyb.getCode({ appId: ctx.app.appId });
      const data = await ctx.http.postJson('https://api.example.com/login', { code });
      await ctx.account.session.save(data);
      ctx.log.success('登录成功');
    }

    const result = await ctx.http.postJson('https://api.example.com/sign', {});
    return {
      ok: true,
      message: result.alreadySigned ? '今日已签到' : '签到成功',
      alreadyDone: Boolean(result.alreadySigned),
      metrics: { earned: result.points ?? 0 },
    };
  },
};</pre>
          <p class="text-xs text-slate-500">
            应用脚本直接放在 <code>data/apps/&lt;siteKey&gt;/scripts/</code>；脚本文件可在应用详情里在线编辑。
          </p>
        </section>

        <section id="context" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">Context 一览</h3>
          <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-500 dark:bg-slate-800/60">
                <tr>
                  <th class="px-3 py-2 font-medium">属性</th>
                  <th class="px-3 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="row in contextRows" :key="row[0]">
                  <td class="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-brand-700 dark:text-brand-100">{{ row[0] }}</td>
                  <td class="px-3 py-2 text-slate-600 dark:text-slate-300">{{ row[1] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="errors" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">日志与错误详情</h3>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            <code>ctx.log.*(message, details)</code> 的第二个参数就是结构化详情；平台脱敏后保存，并显示在运行日志下方。
            失败返回值和抛出的错误也支持 <code>details</code>。
          </p>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">// 1. 日志详情
ctx.log.error('兑换失败', { code: 'SOLD_OUT', response });

// 2. 业务失败返回详情
return {
  ok: false,
  message: '签到失败',
  errorCode: 'sign_failed',
  details: { status: 401, response },
};

// 3. 抛出错误时带详情
throw ctx.businessError('sign_failed', '签到失败', {
  details: { status: 401, response },
});</pre>
          <p class="text-xs text-slate-500">
            运行详情会显示“错误详情”，每条日志右侧/下方也有“查看详情”。token、手机号等字段会脱敏。
          </p>
        </section>

        <section id="login-yyb" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">登录与 YYB</h3>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">// 小程序登录 code
const code = await ctx.yyb.getCode({ appId: 'wx...' });

// 手机号
const phone = await ctx.yyb.getPhoneNumber();

// 完整手机号授权包：{ code, encryptedData, iv, data, ... }
const auth = await ctx.yyb.getPhoneAuth({ appId: 'wx...' });</pre>
          <p class="text-xs text-slate-500">
            需要手机号授权注册时，建议由用户点击“一键注册”后再调用 <code>getPhoneAuth()</code>；
            未注册时抛 <code>ctx.manualRequired()</code> 并带 <code>details: { action: 'register' }</code>，页面会显示注册按钮；
            需要填写字段时再加 <code>details.formSchema</code>，页面会弹出注册表单，字段通过 <code>ctx.input</code> 传给下一次 Run。
          </p>
        </section>

        <section id="http-cache" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">HTTP / 缓存 / 配置</h3>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">const data = await ctx.http.getJson('https://api.example.com/list');
await ctx.http.postJson('https://api.example.com/sign', { id: 1 });

await ctx.cache.set('account', 'token', token, 86400);
const cached = await ctx.cache.get('account', 'token');

const token = ctx.config.get('token');
const appId = ctx.env.get('APP_ID');</pre>
          <p class="text-xs text-slate-500">
            HTTP 会校验应用白名单；请求失败会抛出带 code/details 的错误。敏感信息不要写进日志。
          </p>
        </section>

        <section id="data-api" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">商品 / 积分 / 订单</h3>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">await ctx.products.sync([
  { externalId: 'C7885', name: '5元优惠券', pointsCost: 400, stock: 10 },
], { deactivateMissing: true });

await ctx.points.sync({ balance: 120, estimated: false });
await ctx.points.add(5, { reason: '签到奖励' });

await ctx.orders.record({
  capability: 'redeem',
  productExternalId: 'C7885',
  quantity: 1,
  pointsCost: 400,
  status: 'success',
  message: '兑换成功',
});</pre>
        </section>

        <section id="activity-form" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">活动表单与运行输入</h3>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            脚本可以为活动定义参加表单。带 <code>formSchema</code> 的活动会在活动页显示“参加”，提交后平台排队运行该脚本，
            表单值在 <code>ctx.input.values</code>。
          </p>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">await ctx.activities.upsert({
  externalId: 'brand.lottery',
  name: '品牌抽奖',
  status: 'available',
  formSchema: {
    title: '填写抽奖信息',
    fields: [
      { key: 'phone', label: '手机号', type: 'tel', required: true },
      { key: 'address', label: '收货地址', type: 'textarea', required: true },
    ],
  },
});

if (ctx.input.source === 'activity') {
  const { activityExternalId, values } = ctx.input;
  await ctx.http.postJson('https://api.example.com/activity/join', {
    activityId: activityExternalId,
    ...values,
  });
}</pre>
        </section>

        <section id="notify" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">通知 / 产物 / 状态</h3>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">await ctx.notify.success('签到成功', { points: 5 });
await ctx.notify.fail('兑换失败', { code: 'SOLD_OUT' });

await ctx.artifacts.json('summary.json', { points: 120 });
await ctx.artifacts.write('page.html', html);

await ctx.state.set('lastRunAt', ctx.time.iso());
const last = await ctx.state.get('lastRunAt');

await ctx.time.sleepUntil('2026-11-17T08:00:00+08:00');</pre>
        </section>

        <section id="return" class="card scroll-mt-20 space-y-3">
          <h3 class="text-sm font-semibold">返回值</h3>
          <pre class="overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-200">return {
  ok: true,
  message: '签到成功，获得 5 积分',
  alreadyDone: false,
  data: { keepSignDay: 2 },
  details: null,          // 失败详情，会显示在运行详情
  metrics: { earned: 5, pointsAfter: 153 },
  artifacts: ['summary.json'],
};</pre>
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">ok: false = 业务失败</span>
            <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">alreadyDone = 今日已完成</span>
            <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">metrics = 运行摘要</span>
            <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">details = 错误详情</span>
          </div>
        </section>

        <section class="card space-y-1 text-xs text-slate-500">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-200">完整文档</div>
          <p>仓库内的 <code>docs/19-script-sdk.md</code> 和 <code>docs/20-script-development-guide.md</code> 包含更完整的 API、错误模型和迁移示例。</p>
        </section>
      </div>
    </div>
  </div>
</template>
