# 20 脚本开发指南

面向脚本开发者。API 签名以 [19 脚本 SDK](19-script-sdk.md) 为准，本文讲怎么从零写一个可运行的脚本。

## 1. 5 分钟跑通

### 1.1 新建文件

在应用目录：

```text
data/apps/<siteKey>/scripts/hello.js
```

写一个最小脚本：

```js
module.exports = {
  async run(ctx) {
    ctx.log.info('hello', {
      app: ctx.app.key,
      account: ctx.account.displayName,
      args: ctx.args,
    });

    return {
      ok: true,
      message: 'hello',
      data: { app: ctx.app.name },
    };
  },
};
```

### 1.2 在平台添加脚本

应用详情 → 应用脚本 → 添加脚本：

- 名称：Hello
- 脚本文件：hello.js
- 参数：可留空
- 启用：勾选

### 1.3 绑定账号并运行

应用详情 → 应用账号 → 绑定微信账号 → 脚本行点“运行”。

运行页可以看到：

- 状态
- 耗时
- 错误码
- 日志

## 2. 脚本文件结构

```text
data/apps/<siteKey>/scripts/
  hello.js
  common.js
  login.js
  sign-in.js
  points.js
```

- 入口文件必须导出 `{ run(ctx) }`。
- 可以 `require('./common')` 复用相对模块。
- 只允许加载脚本目录内的相对模块。
- 平台模式禁止 `fs`、`net`、`child_process` 等危险内置模块。
- 需要第三方包时，先走订阅源打包，不要把 `node_modules` 放进脚本目录。

### 2.1 CommonJS 和 TypeScript

平台直接运行脚本文件，因此应用脚本推荐使用 CommonJS JS：

```js
const { helper } = require('./common');

module.exports = {
  async run(ctx) {
    return { ok: true, message: helper() };
  },
};
```

订阅源可以发布 esbuild 打包后的 CommonJS bundle；开发时可以用 TypeScript，发布前打包。

> `@free-welfare/sdk` 当前是仓库内 workspace 包，未发布到 npm。应用脚本不需要安装它，`ctx` 由平台注入；需要类型提示时，在仓库内引用 `packages/sdk`。

## 3. 参数、配置、环境变量

### 3.1 脚本参数

应用脚本的“参数”会以空格拆分：

```text
C7885 --confirm
```

脚本里读：

```js
const giftId = ctx.args[0];
const confirm = ctx.args.includes('--confirm');
```

也可以读原始字符串：

```js
ctx.run.script.args;
```

### 3.2 运行输入（活动参加）

活动页点击“参加”时，平台会排队一个所属脚本的运行，并把表单值放进 `ctx.input`：

```js
const { source, activityExternalId, activityName, values } = ctx.input;

if (source === 'activity') {
  ctx.log.info(`参加活动：${activityName}`, { activityExternalId, values });
  // 使用 values.phone、values.address 等提交活动
} else {
  // 普通签到 / 定时任务
}
```

`ctx.input` 在没有输入时是空对象 `{}`。普通定时任务不会带活动输入。

### 3.3 应用配置

应用详情 → 应用配置（JSON）：

```json
{
  "apiBase": "https://api.example.com",
  "debug": false
}
```

```js
const base = ctx.app.config.getString('apiBase', 'https://api.example.com');
const debug = ctx.app.config.getBoolean('debug', false);
```

支持点路径：

```js
ctx.app.config.get('login.retry');
```

### 3.4 环境变量

应用详情 → 环境变量，值会加密存储。

```js
const cookie = ctx.env.require('COOKIE');
const timeout = ctx.env.getNumber('TIMEOUT_MS', 15000);
```

青龙模式会把同一份变量注入 `process.env`。

### 3.5 脚本/任务配置

`ctx.config` 是脚本绑定或任务配置，不是应用配置：

```js
const accountId = ctx.config.require('accountId');
```

### 3.6 积分名称

应用详情 → 应用信息 → 积分别名，默认“积分”。脚本仍然通过 `ctx.points` 写入余额和流水，不需要关心展示名称；积分、商品、抢购、订单等页面会按应用显示该名称，例如“金币”“成长值”。

## 4. HTTP 请求

所有请求走 `ctx.http`，平台会检查应用白名单。

```js
const res = await ctx.http.request({
  method: 'GET',
  url: '/api/points',
  baseURL: 'https://api.example.com',
  headers: {
    Authorization: `Bearer ${session.token}`,
  },
  query: { accountId: session.accountId },
  timeoutMs: 15000,
  retry: {
    retries: 2,
    delayMs: 500,
    retryOnStatus: [429, 500, 502, 503, 504],
  },
  responseType: 'json',
});
```

快捷方法：

```js
const data = await ctx.http.getJson(url);
const data2 = await ctx.http.postJson(url, { accountId: session.accountId });
```

- 4xx/5xx 不自动抛异常，返回 `ok: false`。
- `response.data` 是 JSON，`response.text` 是文本，`response.base64` 是二进制。
- `response.setCookies` 保留原始 `Set-Cookie` 列表；`response.headers['set-cookie']` 在多条 Cookie 时可能只剩最后一条，需要完整 Cookie 时优先用 `setCookies`。
- 域名必须先加入应用“根 URL”。

## 5. 登录 / 会话模板

```js
const { withSession, request, getProfile } = require('./common');

module.exports = {
  async run(ctx) {
    return withSession(ctx, async (session) => {
      const res = await request(ctx, session, 'GET', 'api/points', {
        query: { accountId: session.accountId },
      });
      return {
        ok: true,
        message: '读取成功',
        data: res.data,
      };
    });
  },
};
```

`withSession` 内部会：

1. 读 `ctx.account.session`
2. 没有或过期时调用 `ctx.yyb.getCode()`
3. 调登录接口
4. 把 `sid` / `token` 等写回加密 session

### 5.1 手机号授权 / 自动注册

部分小程序登录后只返回 `identityId` / `accessToken`，还要用手机号授权 code 才能注册。平台提供完整授权结果：

```js
const auth = await ctx.yyb.getPhoneAuth({ appId: 'wx...' });
// auth: { code, encryptedData, iv, data, ... }
```

`code` 就是小程序 `getPhoneNumber` 返回的一次性授权 code，可提交给业务注册接口。`ctx.yyb.getPhoneNumber()` 仍返回手机号字符串；`getPhoneAuth()` 返回完整授权包。建议由用户点击“一键注册”后再调用，不要在失败时自动注册；拿不到 code 时应回退到 `ctx.manualRequired()`，并通过 `details: { action: 'register' }` 让页面显示注册按钮。

注册需要用户填写简单字段时，可以在 `details.formSchema` 里声明表单，页面会弹出注册表单，提交后字段会放进下一次 Run 的 `ctx.input`：

```js
throw ctx.manualRequired('需要补充注册信息', {
  details: {
    action: 'register',
    formSchema: [
      { key: 'name', label: '姓名', type: 'text', required: true },
      { key: 'phone', label: '手机号', type: 'tel', required: true },
      { key: 'agreement', label: '同意注册协议', type: 'checkbox', required: true },
    ],
  },
});
// 第二次 Run：ctx.input = { action: 'register', name, phone, agreement: 'true' }
```

支持的字段类型：`text`、`tel`、`number`、`textarea`、`select`、`checkbox`；`options` 用于 `select`，`defaultValue`、`placeholder`、`note` 可选。

## 6. 常用能力

### 6.1 缓存

```js
const token = await ctx.cache.remember('login:token', 3600, async () => {
  return login();
});
```

- `ctx.cache` 默认账号级
- `ctx.cache.scope('app')` 应用级
- `ctx.cache.scope('run')` 本次运行级

### 6.2 积分

```js
await ctx.points.sync({
  balance: 148,
  expiringAmount: 19,
  nextExpiryAt: '2026-12-31T23:59:59+08:00',
});

await ctx.points.add(5, { type: 'earn', description: '签到' });
await ctx.points.spend(400, { type: 'spend', description: '兑换' });
```

### 6.3 商品 / 抢购商品

```js
await ctx.products.upsert({
  externalId: 'C7885',
  name: '5元优惠券',
  pointsCost: 400,
  stock: 70000,
  status: 'on_sale',
  startAt: '2026-10-01T00:00:00+08:00',
  endAt: '2026-12-31T23:59:59+08:00',
});

await ctx.grab.upsert({
  externalId: 'C7885',
  name: '5元优惠券',
  pointsCost: 400,
  stock: 70000,
});
```

`sync(items, { deactivateMissing: true })` 可以把本次未出现的商品标记下架。

### 6.4 活动

活动可以附带一份由脚本定义的表单。平台会保存 `formSchema`，并把当前脚本记为参与脚本；活动页会为这类活动显示“参加”按钮。

```js
await ctx.activities.upsert({
  externalId: 'demo.prize',
  name: '抽奖活动',
  type: 'lottery',
  status: 'available',
  points: 100,
  formSchema: {
    title: '填写抽奖信息',
    description: '信息仅用于本次活动',
    submitText: '提交抽奖',
    fields: [
      { key: 'phone', label: '手机号', type: 'tel', required: true },
      { key: 'address', label: '收货地址', type: 'textarea', required: true },
      { key: 'size', label: '尺码', type: 'select', options: ['S', 'M', 'L'], required: true },
    ],
  },
});
```

用户点击“参加”后，平台会排队运行这个脚本，表单值在 `ctx.input.values`：

```js
if (ctx.input.source === 'activity') {
  const { activityExternalId, values } = ctx.input;
  await ctx.http.postJson('/api/activity/join', {
    activityId: activityExternalId,
    ...values,
  });
}
```

不传 `formSchema` 的活动不会显示“参加”按钮，只作为展示/进度记录。

```js
await ctx.activities.upsert({
  externalId: 'demo.daily_sign',
  name: '每日签到',
  type: 'daily',
  status: 'completed',
  progressCurrent: 1,
  progressTarget: 1,
  action: 'sign_in',
});
```

### 6.5 订单

```js
await ctx.orders.record({
  capability: 'redeem',
  productExternalId: 'C7885',
  quantity: 1,
  pointsCost: 400,
  status: 'success',
  message: '兑换成功',
});
```

### 6.6 通知

```js
await ctx.notify.success('签到成功，获得 5 积分');
await ctx.notify.fail('兑换失败：积分不足');
await ctx.notify.send({
  title: '库存提醒',
  body: '5元券补货了',
  level: 'info',
});
```

### 6.7 产物 / 状态

```js
await ctx.artifacts.json('summary.json', { count: 2 });
await ctx.artifacts.write('page.html', html);

await ctx.state.set('lastRunAt', new Date().toISOString());
const last = await ctx.state.get('lastRunAt');
```

## 7. 错误模型

```js
if (!session) throw ctx.authExpired('登录失效');
if (!stock) throw ctx.businessError('sold_out', '商品已售罄');
if (needCaptcha) throw ctx.manualRequired('需要手动完成验证码');
```

需要展示接口返回、错误码等详情时，有三种方式：

```js
// 1. 日志第二个参数就是详情对象，会显示在运行日志下方
ctx.log.error('兑换失败', { code: 'SOLD_OUT', response });

// 2. 业务失败时通过 details 返回
return {
  ok: false,
  message: '签到失败',
  errorCode: 'sign_failed',
  details: { code: 401, response },
};

// 3. 抛出错误时通过 options.details 返回
throw ctx.businessError('sign_failed', '签到失败', {
  details: { code: 401, response },
});
```

`ctx.log.*(message, details)` 的第二个参数就是结构化详情；平台会脱敏后保存，并在运行详情的“查看详情”里展开。失败运行的 `details` 也会显示在“错误详情”中。

平台根据错误码和 `manual` / `retryable` 决定：

- 是否重试
- 是否通知
- 是否在运行页显示“需要人工处理”

不要用 `console.log` 输出 token、cookie、手机号、sid。

## 8. 返回值

```js
return {
  ok: true,
  message: '签到成功，获得 5 积分',
  alreadyDone: false,
  data: { keepSignDay: 2 },
  metrics: { earned: 5, pointsAfter: 153 },
};
```

- `ok: false` 表示业务失败
- `alreadyDone: true` 表示今天已完成
- `metrics` 会进入运行摘要
- `data` 会显示在运行详情
- `details` 用于失败详情（接口返回、错误响应等），会显示在“错误详情”中

## 9. 青龙兼容

应用脚本模式选择“青龙兼容”后：

- 环境变量注入 `process.env`
- 注入 `FW_RUN_ID`、`FW_SITE_KEY`、`FW_ACCOUNT_NAME` 等
- 可以直接运行已有 Node/青龙脚本
- 仍建议网络走白名单
- 只运行可信脚本

从青龙迁移时：

1. 把脚本放到 `data/apps/<siteKey>/scripts/`
2. 在应用里添加环境变量
3. 应用脚本条目选择该文件
4. 参数填原来的执行参数
5. 先手动运行看日志

## 10. 从青龙脚本迁移

已有青龙脚本可以用 `createLegacyAdapter(ctx)` 快速迁移，减少运行层代码改动：

```js
const { createLegacyAdapter } = require('@free-welfare/sdk');

module.exports = {
  async run(ctx) {
    const a = createLegacyAdapter(ctx);
    const code = await a.getCode({ appId: 'wx...' });
    const data = await a.requestJson({
      method: 'POST',
      baseURL: 'https://api.example.com',
      path: '/login',
      body: { code },
    });
    await a.cacheSet('auth', data, 7 * 86400);
    return { ok: true, message: '登录成功' };
  },
};
```

适配器提供：

| 方法 | 说明 |
| --- | --- |
| `account` | 当前账号 `{ ref, remark }`，用于日志 |
| `label()` | 脱敏账号标签 |
| `getCode({ appId })` | 平台 YYB 取码 |
| `request()` / `requestJson()` | 走 `ctx.http` 白名单的 HTTP |
| `cacheGet()` / `cacheSet()` / `cacheDelete()` | 账号级缓存 |
| `maskRef()` / `sleep()` | 常用旧脚本辅助 |

批量导入应用清单：

```bash
pnpm import:apps -- --bind-all
```

目录结构见 `data/apps/_porting/GUIDE.md`：每个应用一个 `app.json`，脚本放在 `scripts/`。导入默认停用脚本，确认后再启用。

## 11. 发布到订阅源

订阅源 `index.json`：

```json
{
  "schema_version": 1,
  "scripts": [
    {
      "id": "demo.sign_in",
      "name": "每日签到",
      "version": "0.1.0",
      "kind": "action",
      "capability": "sign_in",
      "review_status": "reviewed",
      "bundle_url": "https://.../demo-sign-in-0.1.0.js",
      "sha256": "...",
      "min_platform_version": "0.1.0"
    }
  ]
}
```

推荐：

- 用 esbuild 打包成 CommonJS
- 计算 sha256
- bundle 不超过 2MB
- 一个功能一个脚本
- 公共逻辑放 common 模块或直接打包进 bundle
- 不要硬编码 token、cookie、手机号

平台会：

1. 同步 index
2. 下载 bundle
3. 校验 sha256
4. 写入 `data/scripts/<key>/<version>/bundle.js`
5. 安装/回滚

## 12. 调试

### 11.1 看运行日志

应用详情 → 运行脚本 → 运行页查看：

- 状态
- 错误码
- 日志
- 耗时

### 11.2 先做预检

写兑换、写操作时，先做预检模式：

```js
if (!ctx.args.includes('--confirm')) {
  return { ok: true, message: '预检通过，未提交', data: precheck };
}
```

### 11.3 单元测试

SDK 的 `createScriptContext(host)` 可以用 mock `ScriptHost` 测试脚本逻辑。平台仓库已有 `packages/sdk/tests/context.test.ts` 作为示例。

## 13. 开发检查清单

- [ ] 文件是 CommonJS，导出 `run(ctx)`
- [ ] 没有 `fs` / `net` / `child_process`
- [ ] 网络域名已加入应用根 URL
- [ ] 用 `ctx.http`，没有直接 `fetch`
- [ ] 没有硬编码 token / cookie / 手机号
- [ ] 写操作支持 `--confirm` 或预检
- [ ] 写操作幂等，失败不会重复提交
- [ ] 日志不含敏感字段
- [ ] 返回值有 `ok` / `message`
- [ ] 手动运行成功，再配置 cron
