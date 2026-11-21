# 19 脚本 SDK

平台给脚本开发者的统一接口。脚本只依赖 `@free-welfare/sdk`，不直接接触数据库、宿主机环境变量或 YYB 协议令牌。

> 当前实现：`worker_threads + vm` 运行器已接入应用脚本，支持 `platform` 与 `qinglong` 两种模式。应用脚本是 CommonJS 文件，导出 `{ run(ctx) }`；订阅源发布的是打包后的 CommonJS bundle。
>
> 开发者先读 [20 脚本开发指南](20-script-development-guide.md)，本文是完整 API 参考。

## 0. 实现状态

| 能力 | 状态 |
| --- | --- |
| `ctx.config` / `ctx.env` / `ctx.app.config` | 已实现 |
| `ctx.account.session` / `refresh` | 已实现，session AES-GCM 加密 |
| `ctx.user.getInfo` / `getPhone` / `getPoints` | 已实现；手机号走 YYB |
| `ctx.yyb.getCode` / `refreshAccount` / `health` / `listAccounts` | 已实现 |
| `ctx.yyb.getPhoneNumber` / `operateWxData` | 已实现，真实账号按需验证 |
| `ctx.http` | 已实现白名单、超时、重试、JSON/文本/Base64 |
| `ctx.cache` | 已实现 run/account/app 三级 |
| `ctx.log` | 已实现步骤/进度/子 logger |
| `ctx.crypto` | 已实现哈希/HMAC/Base64/AES/RSA |
| `ctx.products` / `ctx.grab` | 已实现读取、批量同步、库存/状态 |
| `ctx.points` | 已实现余额、流水、批次 |
| `ctx.activities` | 已实现 upsert/进度/完成 |
| `ctx.orders` | 已实现记录/列表/更新 |
| `ctx.notify` | 已实现通知记录 + Server酱 |
| `ctx.artifacts` | 已实现文本/JSON/二进制产物 |
| `ctx.state` | 已实现账号级持久状态 |
| `ctx.time.sleepUntil` | 已实现 |
| `ctx.args` | 已实现，按空格拆分脚本参数 |
| 订阅源依赖安装 | 未实现；bundle 应自包含 |
| 沙箱隔离 | `vm` 不是安全沙箱，只运行可信脚本 |

## 1. 设计目标

- **一个上下文走天下**：账号、应用、YYB、HTTP、缓存、日志、加密、商品、积分、活动、订单、通知、文件都在 `ctx` 里。
- **平台能力，而不是脚本重造**：脚本不自己存 token、不自己拼日志、不自己写数据库。
- **默认安全**：网络请求走平台代理；环境变量按应用隔离；密钥不进日志。
- **可测试**：SDK 只有类型和轻量包装，runner 注入 `ScriptHost` 后可单测。
- **兼容青龙**：应用可选 `qinglong` 模式，环境变量注入 `process.env`。

## 2. 快速开始

应用脚本是 CommonJS 文件，推荐写法：

```js
module.exports = {
  async run(ctx) {
    ctx.log.step('检查登录状态');
    const session = await ctx.account.session.get();

    if (!session?.token) {
      const code = await ctx.yyb.getCode();
      const data = await ctx.http.postJson('https://api.example.com/login', { code });
      await ctx.account.session.save(data, new Date(Date.now() + 7 * 86400_000));
      ctx.log.success('登录成功');
    }

    const sign = await ctx.http.postJson('https://api.example.com/sign', {});
    return {
      ok: true,
      message: sign.alreadySigned ? '今天已签到' : '签到成功',
      alreadyDone: Boolean(sign.alreadySigned),
      metrics: { earned: sign.points ?? 0 },
    };
  },
};
```

如果做订阅源 bundle，可以先用 TypeScript 写，再 esbuild 打包成 CommonJS。`defineAdapter` 只是类型辅助，不是运行时必需。

### 2.1 包与运行方式

- 仓库内开发：`@free-welfare/sdk` 是 workspace 包，可直接 import 类型和辅助函数。
- 应用脚本：平台直接执行 `data/apps/<siteKey>/scripts/*.js`，不经过 esbuild；推荐 CommonJS。
- 订阅源：发布 esbuild 打包后的 CommonJS bundle；平台下载并运行。
- 外部开发者：当前 SDK 未发布到 npm；可以复制 `packages/sdk` 的类型，或直接按本文档使用注入的 `ctx`。
- `ctx` 永远由平台注入，脚本不需要自己创建。

## 3. Context 总览

| 命名空间 | 作用 |
| --- | --- |
| `ctx.run` | 本次运行信息：runId、能力、触发方式、脚本版本 |
| `ctx.args` | 脚本参数（空格拆分后的数组） |
| `ctx.app` / `ctx.site` | 应用信息、应用配置、应用环境变量 |
| `ctx.account` | 当前微信账号、绑定账号、会话读写 |
| `ctx.user` | 用户资料：昵称、手机号、积分等 |
| `ctx.yyb` | YYB 取 code、手机号、账号状态、refresh |
| `ctx.http` | 受控 HTTP 客户端，自动白名单/超时/重试 |
| `ctx.cache` | run / account / app 三级缓存 |
| `ctx.log` | 结构化日志、步骤、进度、子 logger |
| `ctx.crypto` | 哈希、HMAC、Base64、AES、RSA、随机数 |
| `ctx.env` | 应用环境变量（青龙模式的同一份变量） |
| `ctx.config` | 当前脚本/任务配置 |
| `ctx.products` | 普通商品读取、批量同步、库存/状态更新 |
| `ctx.grab` | 抢购商品，接口与 `ctx.products` 相同 |
| `ctx.points` | 积分余额、批次、流水 |
| `ctx.activities` | 活动/任务同步与进度 |
| `ctx.orders` | 兑换/抢购订单记录 |
| `ctx.notify` | 发送通知 |
| `ctx.artifacts` | 运行产物（截图、JSON、日志） |
| `ctx.state` | 可持久化的脚本状态 |
| `ctx.time` | 服务器时间、时区偏移、sleep |
| `ctx.retry` / `ctx.sleep` / `ctx.assert` / `ctx.fail` | 常用控制流 |

## 3.5 脚本参数

应用脚本的“参数”字段会按空格拆分：

```text
C7885 --confirm
```

```js
const giftId = ctx.args[0];
const confirm = ctx.args.includes('--confirm');
const raw = ctx.run.script.args; // 原始字符串
```

## 4. 应用与配置

```ts
ctx.app.key;          // demo
ctx.app.name;         // 示例应用
ctx.app.appId;        // wx...
ctx.app.mode;         // platform / qinglong

const base = ctx.app.config.getString('apiBase', 'https://api.example.com');
const flags = ctx.app.config.getJson<{ debug?: boolean }>('flags', {});
const accountId = ctx.config.require<string>('accountId');
const cookie = ctx.env.require('COOKIE');
```

- `ctx.app.config`：应用详情里的“应用配置（JSON）”。
- `ctx.config`：脚本/任务自己的配置（绑定或任务配置）。
- `ctx.env`：应用详情里的环境变量；和青龙模式注入的 `process.env` 是同一份。

`ConfigApi` / `EnvApi` 都支持：

```ts
get / require / has / all
getString / getNumber / getBoolean / getJson
```

配置支持点路径：`ctx.app.config.get('login.apiBase')`。

## 5. 账号与用户

```ts
ctx.account.id;               // SiteAccount id
ctx.account.yybRef;           // YYB ref
ctx.account.displayName;
ctx.account.businessUserId;
ctx.account.status;
ctx.account.nickname;
ctx.account.openidMasked;

const session = await ctx.account.session.get<Record<string, unknown>>();
await ctx.account.session.save({ token: '...' }, new Date(Date.now() + 7 * 86400_000));
await ctx.account.session.clear();
await ctx.account.refresh();

const info = await ctx.user.getInfo();
const phone = await ctx.user.getPhone();
const points = await ctx.user.getPoints();
```

- 手机号不在脚本里硬编码，统一通过 YYB / 平台账号资料读取。
- 日志默认脱敏手机号、token、cookie。

## 6. YYB

```ts
const code = await ctx.yyb.getCode();
const phone = await ctx.yyb.getPhoneNumber();
const wxData = await ctx.yyb.operateWxData({ data: '...' });
const health = await ctx.yyb.health();
const accounts = await ctx.yyb.listAccounts();
await ctx.yyb.refreshAccount();
```

脚本只拿到业务结果，不接触 YYB 集成令牌。

## 7. HTTP

```ts
const res = await ctx.http.request({
  method: 'GET',
  url: '/api/points',
  baseURL: 'https://api.example.com',
  headers: { Authorization: `Bearer ${token}` },
  query: { page: 1 },
  timeoutMs: 15_000,
  retry: { retries: 2, delayMs: 500, retryOnStatus: [429, 500, 502, 503, 504] },
  responseType: 'json',
});

const data = await ctx.http.getJson('https://api.example.com/products');
const result = await ctx.http.postJson('https://api.example.com/redeem', { productId });
```

- 只允许 `http` / `https`，并且必须命中应用白名单。
- 域名、私网、回环、云元数据地址由平台代理拦截。
- 响应支持 `json` / `text` / `base64`；默认限制响应体大小。
- 4xx/5xx 不抛异常，返回 `ok: false`，由脚本决定重试或业务失败。

## 8. 缓存

```ts
await ctx.cache.set('login:token', token, 3600);
const cached = await ctx.cache.get<string>('login:token');
const fresh = await ctx.cache.remember('products', 300, async () => {
  return ctx.http.getJson('https://api.example.com/products');
});
await ctx.cache.increment('grab:count', 1, 86400);
await ctx.cache.delete('products');

const appCache = ctx.cache.scope('app');
const runCache = ctx.cache.scope('run');
```

| scope | 生命周期 |
| --- | --- |
| `run` | 仅本次运行，运行结束销毁 |
| `account` | 当前应用账号，默认 |
| `app` | 当前应用下所有账号共享 |

缓存值必须是 JSON 可序列化的数据。

## 9. 日志

```ts
ctx.log.debug('调试信息', { step: 1 });
ctx.log.info('同步商品', { count: 20 });
ctx.log.warn('库存不足');
ctx.log.error('兑换失败', { code: 'SOLD_OUT' });
ctx.log.success('签到完成');
ctx.log.step('第二步：领取任务');
ctx.log.progress(3, 10, '同步商品');
const log = ctx.log.child({ capability: 'sign_in' });
```

日志自动带 `runId`、时间、级别；平台做长度限制与敏感字段脱敏。

## 10. 加密与编码

```ts
ctx.crypto.md5('abc');
ctx.crypto.sha256('abc');
ctx.crypto.hmac('sha256', 'key', 'data');
ctx.crypto.base64Encode('hello');
ctx.crypto.base64Decode('aGVsbG8=');
ctx.crypto.aesEncrypt('plain', '32-byte-key...', { mode: 'cbc', iv: '16-byte-iv...' });
ctx.crypto.aesDecrypt(cipher, '32-byte-key...', { mode: 'cbc', iv: '16-byte-iv...' });
ctx.crypto.rsaEncrypt('plain', publicKeyPem);
ctx.crypto.rsaDecrypt(cipher, privateKeyPem);
ctx.crypto.rsaSign('data', privateKeyPem, 'sha256');
ctx.crypto.rsaVerify('data', signature, publicKeyPem, 'sha256');
ctx.crypto.randomBytes(16, 'hex');
ctx.crypto.uuid();
```

AES 默认 CBC/PKCS7，支持 `cbc` / `ecb` / `gcm`，key/iv 支持 `utf8` / `base64` / `hex`。

## 11. 商品与抢购商品

普通商品：

```ts
await ctx.products.upsert({
  externalId: 'p1001',
  name: '示例帆布袋',
  pointsCost: 1200,
  stock: 10,
  status: 'on_sale',
  imageUrl: 'https://...',
  raw: sourceItem,
});

await ctx.products.upsertMany(items);
await ctx.products.sync(items, { deactivateMissing: true });
await ctx.products.setStock('p1001', 5);
await ctx.products.setStatus('p1001', 'sold_out');
const list = await ctx.products.list({ status: 'on_sale', limit: 50 });
```

抢购商品使用同一套接口，但独立命名空间和 `kind='grab'`：

```ts
await ctx.grab.upsert({
  externalId: 'g1001',
  name: '限量礼盒',
  pointsCost: 999,
  stock: 1,
  startAt: '2026-11-20T10:00:00+08:00',
});
await ctx.grab.setStock('g1001', 0);
```

`sync` 默认不删除商品，只更新/补建；`deactivateMissing: true` 会把本次未出现的商品标记为下架。

## 12. 积分

```ts
const snapshot = await ctx.points.get();
await ctx.points.sync({
  balance: 1234,
  expiringAmount: 50,
  nextExpiryAt: '2026-12-31T00:00:00+08:00',
  rulesText: '消费 1 元 = 1 积分',
});

await ctx.points.add(20, { type: 'earn', description: '签到奖励' });
await ctx.points.spend(100, { type: 'spend', description: '兑换商品' });
await ctx.points.addLot({ amount: 20, source: 'sign_in', expiresAt: '2026-12-31' });
await ctx.points.listTransactions({ limit: 20 });
await ctx.points.listLots();
```

`add` / `spend` 会同步更新余额并写积分流水。

页面展示的名称来自应用信息里的“积分别名”（`pointsName`，默认“积分”），脚本不需要关心展示名称。

## 13. 活动、订单、通知、产物

```ts
await ctx.activities.upsert({
  externalId: 'a1',
  name: '每日签到',
  type: 'daily',
  points: 5,
  progressCurrent: 1,
  progressTarget: 1,
  status: 'completed',
});
await ctx.activities.setProgress('a1', 1, 1);

await ctx.orders.record({
  capability: 'redeem',
  productExternalId: 'p1001',
  quantity: 1,
  pointsCost: 1200,
  status: 'success',
  message: '兑换成功',
});

await ctx.notify.success('签到成功，获得 5 积分', { points: 5 });
await ctx.notify.send({ title: '库存提醒', body: '礼盒补货了', level: 'info' });

await ctx.artifacts.json('summary.json', { products: 20 });
await ctx.artifacts.write('page.html', html, { contentType: 'text/html' });
```

## 14. 状态与控制流

```ts
const count = await ctx.state.get<number>('failCount', 0);
await ctx.state.set('failCount', count + 1);

await ctx.sleep(1000);
await ctx.time.sleepUntil('2026-11-20T10:00:00+08:00');
ctx.assert(token, '缺少登录 token', 'auth_missing');
ctx.fail('sold_out', '商品已售罄', { retryable: false });

await ctx.retry(() => ctx.http.getJson(url), {
  retries: 3,
  delayMs: 800,
  backoff: 2,
  shouldRetry: (error) => !(error instanceof Error && error.message.includes('404')),
});
```

## 15. 错误模型

```ts
import { ScriptError, scriptErrors } from '@free-welfare/sdk';

throw scriptErrors.business('sold_out', '商品已售罄');
throw scriptErrors.authExpired('登录已失效');
throw scriptErrors.manualRequired('需要手动完成验证码');
throw scriptErrors.network('上游网络异常');
throw scriptErrors.rateLimited('触发限流');
```

`ScriptError` 字段：

| 字段 | 说明 |
| --- | --- |
| `code` | 机器可读错误码 |
| `message` | 展示给用户的说明 |
| `manual` | 是否需要人工处理 |
| `retryable` | 是否允许平台自动重试 |
| `details` | 附加诊断数据 |

平台根据 `manual` / `retryable` 决定是否重试、是否通知。

## 16. 返回值

```ts
return {
  ok: true,
  message: '签到成功，获得 5 积分',
  alreadyDone: false,
  metrics: { pointsBefore: 100, pointsAfter: 105, earned: 5 },
  data: { signDate: '2026-11-13' },
  artifacts: ['summary.json'],
  nextActions: ['redeem'],
  state: { lastSignAt: new Date().toISOString() },
};
```

## 17. 青龙兼容模式

应用详情 → 脚本模式选择“青龙兼容”后：

- 应用环境变量会注入脚本进程的 `process.env`。
- 平台同时注入内置变量：

```text
FW_RUN_ID
FW_SITE_ID
FW_SITE_KEY
FW_SITE_NAME
FW_SCRIPT_ID
FW_SCRIPT_NAME
FW_SCRIPT_VERSION
FW_CAPABILITY
FW_ACCOUNT_ID
FW_ACCOUNT_NAME
FW_YYB_REF
FW_DRY_RUN
FW_TRIGGER
```

- 青龙脚本可以直接使用 `process.env.COOKIE` 等变量。
- 平台模式脚本使用 `ctx.env`；两种模式看到的是同一份应用环境变量。
- 青龙模式允许已有 Node/青龙脚本迁移，但环境变量和脚本内容仍然只在当前账号/运行内生效。
- 只应对可信脚本开启青龙模式；平台仍建议网络请求走白名单。

## 18. 运行时注入（给 runner 实现者）

SDK 的 `createScriptContext(host)` 接收一个 `ScriptHost`：

```ts
import { createScriptContext, type ScriptHost } from '@free-welfare/sdk';

const ctx = createScriptContext(host);
const result = await script.run(ctx);
```

`ScriptHost` 负责：

- 加载应用、账号、配置、环境变量、会话；
- 实现 `http` 代理、缓存、YYB、用户资料、商品、积分、活动、订单、通知、产物、状态；
- 提供同步 `crypto` 函数；
- 写日志时做脱敏和长度限制；
- 运行结束持久化 session / state / 结果。

脚本永远拿不到宿主机的 `process.env`（青龙模式除外）、数据库连接或 YYB 集成令牌。

## 19. 版本与兼容

- SDK 使用 semver；`@free-welfare/sdk` 版本随平台发布。
- 新增字段/方法保持向后兼容；删除或改签名走 major。
- 脚本 manifest 记录 `sdkVersion`，平台在运行前检查最低版本。
- 未实现的宿主能力应在 runner 中明确返回 `not_implemented`，不要静默返回空值。
