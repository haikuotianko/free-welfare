# 05 脚本系统

> **结构说明**：实际脚本按“一功能一脚本 + 公共模块”拆分（注册/签到/积分/商品/活动等各自独立，登录/加密/HTTP 放 common）。本文的合并 adapter 示例只用于展示 SDK/协议；仓库结构和平台管理见 [11 脚本结构](11-script-structure.md)。

## 1. 目标

1. **可复用**：新小程序写多个功能脚本 + 公共模块，不改平台核心。
2. **可订阅**：脚本从 GitHub 源同步，版本/hash/审核状态可追溯。
3. **可管理**：安装、更新、回滚、配置、调度、日志、启停都在界面完成。
4. **可隔离**：每次运行一个账号、一个能力；worker + vm 限资源/限超时。
5. **可审核**：社区 PR 由维护者审核，CI 校验，降低供应链风险。

## 2. 安全边界（先读）

Node 的 `vm` **不是安全沙箱**，无法可靠抵御恶意代码逃逸。本项目的安全模型是：

- **官方源脚本审核后运行**（默认 `reviewed`）。
- 脚本不能直接拿到宿主机环境变量/YYB 协议令牌；网络请求走平台代理，限制允许域名。
- worker 限制内存/超时/输出；运行结束终止。
- **自定义源脚本标记 `custom`，强警告**；首期 custom 只允许 `ctx` API，不允许 `dependencies/require`，用户自己判断风险。

如果以后要运行不可信脚本，必须升级到 Deno/容器/gVisor 等真正的隔离方案。

## 3. 脚本包结构

```text
scripts/demo/
  manifest.json          # 元数据、能力、允许域名、配置 schema
  adapter.ts             # 适配器实现
  README.md              # 使用说明、已知限制
  fixtures/              # 脱敏请求/响应样本
  tests/                 # 单元/契约测试
```

安装后：

```text
data/scripts/demo/0.1.0/
  manifest.json
  bundle.js              # esbuild 产物
  README.md
  bundle.sha256
```

## 4. manifest

```json
{
  "id": "demo.sign_in",
  "name": "每日签到",
  "version": "0.1.0",
  "description": "示例应用每日签到，获取积分",
  "kind": "action",
  "platform": "wechat_miniprogram",
  "app_id": "wx0000000000000000",
  "capability": "sign_in",
  "runtime": "node",
  "entry": "adapter.ts",
  "common_version": "0.1.0",
  "allowed_domains": ["api.example.com"],
  "dependencies": {},
  "update_policy": "manual",
  "default_schedule": {
    "sign_in": "43 8 * * *"
  },
  "config_schema": {
    "type": "object",
    "properties": {}
  },
  "limits": {
    "timeout_seconds": 120,
    "memory_mb": 256,
    "max_log_bytes": 262144
  },
  "min_platform_version": "0.1.0"
}
```

### 4.1 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 全局唯一，`<app>.<capability>` |
| `name` | 是 | 展示名 |
| `version` | 是 | semver |
| `kind` | 是 | `action` / `common` |
| `platform` | 是 | 首期 `wechat_miniprogram` |
| `app_id` | 是 | 目标小程序 AppID |
| `capability` | action 必填 | 单个能力，如 `sign_in` |
| `runtime` | 是 | `node` |
| `entry` | 是 | `adapter.ts` / `adapter.js` |
| `common_version` | 否 | 应用公共模块版本 |
| `allowed_domains` | 是 | 允许脚本访问的域名；必须被应用白名单覆盖；空数组=不允许外网 |
| `dependencies` | 否 | npm 依赖精确版本；官方源可用，自定义源不允许 |
| `update_policy` | 否 | `manual`/`auto`；默认 manual，custom 强制 manual |
| `config_schema` | 否 | JSON Schema，自动生成表单 |
| `limits` | 否 | 超时/内存/日志上限 |
| `min_platform_version` | 否 | 平台最低版本 |

### 4.2 能力

| 能力 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- |
| `login` | 无 | `LoginResult` | code 换业务 token/sid，写 session |
| `sign_in` | 无 | `SignResult` | 幂等签到 + 复查 |
| `points` | 无 | `PointsSnapshot` | 余额/批次/规则 |
| `products` | 无 | `Product[]` | 商品列表 |
| `activities` | 无 | `Activity[]` | 活动/任务 |
| `redeem` | `productId`, `quantity` | `OrderResult` | 纯积分兑换（后续） |
| `grab` | `productId`, `policy` | `OrderResult` | 抢购（后续） |

## 5. 适配器契约

> 下面的代码把多个功能合在一个 adapter 里，只用于对照协议/SDK。实际按一功能一脚本拆分：`sign_in` 脚本只实现 `run()`，通过 `common/auth` 复用登录。示例见 [11 脚本结构](11-script-structure.md)。

```ts
import { defineAdapter, type Context } from '@free-welfare/sdk';

export default defineAdapter({
  async login(ctx: Context) {
    const code = await ctx.yyb.getCode();
    const resp = await ctx.http.post(
      'https://api.example.com/customer/core/wxMiniAppLogin',
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ctx.constants.wmpfUserAgent,
          Referer: `https://servicewechat.com/${ctx.site.appId}/385/page-frame.html`,
          xweb_xhr: '1',
        },
        json: {
          code,
          appid: ctx.site.appId,
          shoId: '',
          userId: '',
          sourceWxsceneid: 1027,
          sourceUrl: 'pages/ucenter_index/ucenter_index',
        },
      },
    );

    if (Number(resp.data?.code) !== 200) {
      throw ctx.businessError('login_failed', resp.data?.msg || '登录失败');
    }
    const sid = String(resp.data?.data?.sid || '').trim();
    if (!sid) throw ctx.businessError('login_failed', '登录未返回 sid');
    ctx.session.set('sid', sid);
    return { ok: true };
  },

  async signIn(ctx: Context) {
    const before = await this.points(ctx);
    const sid = ctx.session.get('sid');
    if (!sid) {
      await this.login(ctx);
    }
    const resp = await ctx.http.post(
      'https://api.example.com/customer/onSign',
      {
        headers: { 'Content-Type': 'application/json' },
        json: { signWay: 0, sid: ctx.session.get('sid') },
      },
    );

    const code = Number(resp.data?.code);
    const message = String(resp.data?.msg || resp.data?.message || '');
    if (code === 200) {
      const earned = Number(resp.data?.data?.points);
      if (Number.isFinite(earned)) {
        // 注意：这里先把 points 当作“本次获得”缓存；它不一定是总余额。
        ctx.session.set('lastEarned', earned);
      }
      return {
        ok: true,
        message: `签到成功${Number.isFinite(earned) ? `，获得 ${earned} 积分` : ''}`,
        pointsBefore: before.balance,
        pointsAfter: before.balance + (Number.isFinite(earned) ? earned : 0),
      };
    }
    if (/已签|签到过|重复|已完成/.test(message)) {
      return { ok: true, alreadyDone: true, message: '今日已签到' };
    }
    if (/登录|sid|未授权|失效|过期|未登录|401/i.test(message)) {
      throw ctx.authExpired(message || '会话失效');
    }
    throw ctx.businessError('sign_failed', message || `签到失败 code=${code}`);
  },

  async points(ctx: Context) {
    // 首期：没有会员信息接口时，只能把最近一次签到获得的积分当“估算”。
    // 找到会员信息/积分总余额接口后，改为调用它，并把 estimated 设为 false。
    const cached = ctx.session.get('lastEarned');
    return {
      balance: Number(cached || 0),
      lots: [],
      rulesText: '签到得积分，兑换规则以应用内说明为准',
      estimated: true,
    };
  },
});
```

> 真实 `points()` 最好调用会员信息接口；如果只有签到响应的 `points`，就明确标 `estimated`，不要假装有批次/有效期。

### 5.1 `Context` API

```ts
ctx.account        // 微信账号（脱敏）；ctx.account.session get/save/clear
ctx.app / ctx.site // { key, name, appId }；ctx.app.config / ctx.app.env
ctx.config         // 绑定配置 ConfigApi：get/require/all/...
ctx.env            // 应用环境变量（青龙模式同一份）
ctx.yyb.getCode()  // 平台代理取 code
ctx.yyb.getPhoneNumber() // 可选
ctx.http.get/post/request // 平台 HTTP 代理
ctx.log.info/warn/error
ctx.sleep(ms)
ctx.time.now()
ctx.runId
ctx.dryRun
ctx.businessError(code, message)
ctx.authExpired(message)
ctx.manualRequired(message)
```

完整接口见 [19 脚本 SDK](19-script-sdk.md)。

### 5.2 返回类型

```ts
type LoginResult = { ok: boolean; businessUserId?: string };

type SignResult = {
  ok: boolean;
  alreadyDone?: boolean;
  message: string;
  pointsBefore?: number;
  pointsAfter?: number;
};

type PointsSnapshot = {
  balance: number;
  lots?: Array<{
    amount: number;
    remaining?: number;
    grantedAt?: string;
    expiresAt?: string | null;
    source?: string;
  }>;
  rulesText?: string;
  estimated?: boolean;
};

type Product = {
  externalId: string;
  name: string;
  pointsCost: number;
  cashCost?: number;
  stock?: number | null;
  status: 'on_sale' | 'sold_out' | 'upcoming' | 'ended';
  limitPerUser?: number | null;
  startAt?: string;
  endAt?: string;
  raw?: unknown;
};

type Activity = {
  externalId: string;
  name: string;
  type: string;
  points?: number;
  status: 'available' | 'in_progress' | 'done' | 'locked' | 'ended';
  progressCurrent?: number;
  progressTarget?: number;
  action?: 'claim' | 'run' | 'none';
  raw?: unknown;
};
```

## 6. 执行协议

### 6.1 编译与依赖

- `esbuild` 把 `adapter.ts` + SDK 打成单文件 CJS；第三方依赖标记 external。
- manifest `dependencies` 由平台统一安装到 `data/deps/<hash>/node_modules`，多个脚本复用。
- 安装用 `--ignore-scripts`，不在每次 run 安装。
- vm 注入受控 `require`，只允许声明的依赖 + 安全内置模块。
- 自定义源脚本不允许 `dependencies/require`，只能用 `ctx` API。
- 产物 hash 写入 `script_versions.bundle_hash`，依赖集合写入 `deps_hash`。

### 6.2 worker

```text
Worker 进程
  -> 创建 worker_thread
  -> worker 读取 bundle/input/run_token
  -> 创建 vm context：
       module, exports, ctx, console(受限)
  -> vm.runInContext(bundle)
  -> 取 adapter[capability]
  -> await fn(ctx)
  -> 结果写 result.json
```

### 6.3 vm 上下文

注入：

- `ctx`（上面 API）
- `module` / `exports`
- 受控 `require`（仅官方脚本 + 声明的依赖 + 安全内置模块）
- `Buffer`、最小 `process` shim（`env: {}`，不暴露 `binding/mainModule`）
- 受限 `console`（映射到 `ctx.log`）
- `setTimeout`/`setInterval` 限制最大延迟；优先 `ctx.sleep`

不注入：

- 真实 `process`、`fs`、`child_process`、`fetch`；`require` 是受控包装（custom 禁用）
- 宿主机 env
- 其他账号/站点数据

> 再次强调：`vm` 不是安全边界；不要运行未审核脚本。

### 6.4 资源限制

- `worker_threads` `resourceLimits`：`maxOldGenerationSizeMb`、`maxYoungGenerationSizeMb`。
- 超时：`setTimeout` + `worker.terminate()`。
- 日志/输出上限：超过截断并标记。
- 并发：每账号串行；全局并发可配。
- 运行目录：`data/artifacts/<runId>/`，结束清理临时文件。

### 6.5 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `2` | 业务失败（可预期，不重试） |
| `3` | 需要重新登录/扫码 |
| `4` | 需要人工（验证码/手机号/支付） |
| `5` | 脚本错误 |
| `124` | 超时 |

## 7. 平台 HTTP 代理

脚本不能直接 `fetch`。`ctx.http` 调用平台：

```http
POST /internal/runner/http
Authorization: Bearer <run_token>
Content-Type: application/json

{
  "method": "POST",
  "url": "https://api.example.com/...",
  "headers": {...},
  "json": {...}
}
```

平台校验：

- run token 有效，且站点/账号匹配。
- 应用 `network_mode`：
  - `whitelist`：URL 必须在应用 `allowed_origins` + 可选 `path_prefix` 内；
  - `unrestricted`：允许公网，但仍拦截私网/回环/元数据/危险端口。
- 脚本 manifest `allowed_domains` 只能缩小，不能扩大应用白名单。
- 禁止内网 IP/localhost/云元数据地址；禁止跨白名单重定向。
- 按账号/站点/run 限流。
- 记录请求元数据（URL/method/status/耗时），不记录敏感 body。
- 可配置出站代理。
- 失败返回 `network_denied`。

## 8. 订阅源

### 8.1 仓库结构

```text
free-welfare-scripts/
  index.json
  scripts/
    demo/
      manifest.json
      adapter.ts
      README.md
      fixtures/
      tests/
```

### 8.2 发布流程

```text
PR
  -> CI: manifest schema / TS 编译 / 单测 / 敏感信息扫描
  -> 维护者审核：接口来源、权限、幂等、错误处理
  -> merge
  -> CI 构建 bundle，计算 sha256
  -> 生成/更新 index.json
  -> 平台同步，显示新版本
```

### 8.3 安装/更新

- 平台 `GET index.json`，展示脚本列表/版本/能力/审核状态。
- 用户选择安装；平台下载 bundle，校验 `sha256`。
- 写入 `script_versions`；`scripts.current_version_id` 指向新版本。
- 更新前显示 changelog；可回滚到旧版本。
- 运行记录关联 `script_version_id`，方便定位“更新后失败”。

### 8.4 审核状态

| 状态 | 含义 | 运行时限制 | UI |
| --- | --- | --- | --- |
| `reviewed` | 官方审核通过 | 可用 dependencies/require | 默认显示 |
| `community` | 社区提交，未完全审核 | 可用 dependencies/require | 需确认 |
| `custom` | 用户自定义源 | 不允许 dependencies/require，只用 ctx API | 强警告 |

自定义源支持，但用户自己判断风险；需要依赖的脚本请提交官方源审核。

## 9. 错误分类与重试

| error_code | 含义 | 重试 | 用户动作 |
| --- | --- | --- | --- |
| `auth_expired` | 业务 token 过期 | 重新登录 1 次 | 仍失败则重扫 |
| `yyb_rescan` | YYB 账号失效 | 否 | 跳 YYB 重扫 |
| `unregistered` | 未注册 | 否 | 注册/绑定手机号 |
| `phone_required` | 需要手机号 | 否 | 授权手机号 |
| `captcha_required` | 验证码 | 否 | 人工完成后重跑 |
| `rate_limited` | 429/限流 | 是（退避） | 等待 |
| `out_of_stock` | 售罄 | 否 | 等补货 |
| `already_done` | 已完成 | 否（算成功） | 无 |
| `business_error` | 业务拒绝 | 否 | 看日志/规则 |
| `network_error` | 网络/5xx | 是（有限） | 自动 |
| `script_error` | 脚本 bug | 否 | 修脚本/升级 |
| `manual_required` | 支付/人工 | 否 | 人工完成 |

写操作原则：

- 先查状态，再写；写后复查。
- “已提交未确认”不要当失败重试；标记 `unknown` 并通知。
- 重试带幂等键/请求 ID（站点支持时）。

## 10. 测试

### 10.1 脚本测试

- manifest schema。
- login：成功/失败/未注册/手机号缺失。
- sign_in：未签到/已签到/重复/会话失效重登。
- points：有余额/无接口/估算。
- products/activities：正常/售罄/未开始/分页。
- 错误码映射。

### 10.2 平台验收

- 安装脚本 → 绑定账号 → 配置 → 手动运行 → 结构化结果。
- 重复运行签到不重复提交。
- 运行失败有标准错误码和可读提示。
- 日志搜不到 code/sid/手机号明文。
- 更新/回滚后旧运行记录仍可查。
- 停用任务后不再调度。

## 11. 脚本首版建议

- 先实现 `login`、`sign_in`、`points`（积分来自签到响应）。
- 每个 action 脚本只声明一个 `manifest.capability`；未实现的功能不要建脚本/不要声明。
- 用抓包/调试工具补商品/活动后，再加能力、发新版本。
- `points.estimated=true`，因为只有签到响应的积分，没有批次/有效期。
- 重复运行：`code=200` 或“已签到”都算成功；不要重复提交。
- 会话失效：清 `sid`，重登一次，再签；仍失败则 `auth_expired`。
