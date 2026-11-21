# 11 脚本结构：一功能一脚本 + 公共模块

本文确定脚本仓库和平台管理的组织方式：**一个功能一个脚本，公共逻辑抽成 common 模块**。

> **当前实现调整**：应用详情采用“应用内脚本条目”管理：名称、简介、脚本文件、参数、启用、删除。脚本文件放在 `data/apps/<key>/scripts/`；**不在界面上手工配置能力**，能力由脚本运行时/manifest 自行声明。标准适配器/订阅源作为后续包装方式保留。

## 1. 目标

- 注册、签到、积分、商品、活动、兑换、抢购各自独立。
- 登录状态、加密/解密、签名、HTTP 封装等公共逻辑只写一次。
- 每个脚本可单独启用/停用、更新、回滚、调度。
- 平台按“应用 → 功能脚本 → 公共模块”管理。
- 写新脚本时，读 `analysis/packages/<key>/docs/` 就能直接实现。

## 2. 脚本类型

| 类型 | `kind` | 是否可运行 | 作用 |
| --- | --- | --- | --- |
| 功能脚本 | `action` | 是 | 一个能力：注册/签到/积分/商品/活动/兑换/抢购 |
| 公共模块 | `common` | 否 | 登录/会话、加密/签名、HTTP、错误处理、工具函数 |

公共模块分两层：

- **全局公共**：`packages/common/`，与具体小程序无关（错误、HTTP、通用 crypto）。
- **应用公共**：`scripts/<key>/common/`，与某个小程序绑定（登录、会话、签名、业务常量）。

## 3. 脚本仓库结构

```text
free-welfare-scripts/
  packages/
    common/                  # 全局公共
      http.ts
      errors.ts
      crypto.ts
      types.ts
      package.json
  scripts/
    demo/
      common/                # 示例应用公共（不直接运行）
        auth.ts              # ensureSession/login/getSession
        crypto.ts            # 示例应用签名/加密（如需要）
        constants.ts         # AppID/路径/headers
        manifest.json        # kind=common
      login/
        manifest.json        # kind=action, capability=login
        adapter.ts
      sign-in/
        manifest.json        # capability=sign_in
        adapter.ts
      points/
        manifest.json        # capability=points
        adapter.ts
      register/
        manifest.json        # capability=register（待确认）
        adapter.ts
      products/
        manifest.json        # capability=products（待补）
        adapter.ts
      activities/
        manifest.json        # capability=activities（待补）
        adapter.ts
```

## 4. 功能脚本 manifest

```json
{
  "id": "demo.sign_in",
  "name": "每日签到",
  "version": "0.1.0",
  "kind": "action",
  "platform": "wechat_miniprogram",
  "app_id": "wx0000000000000000",
  "capability": "sign_in",
  "entry": "adapter.ts",
  "common_version": "0.1.0",
  "dependencies": {},
  "allowed_domains": ["api.example.com"],
  "default_schedule": {
    "cron": "43 8 * * *"
  },
  "config_schema": {
    "type": "object",
    "properties": {}
  },
  "limits": {
    "timeout_seconds": 120,
    "memory_mb": 256
  },
  "update_policy": "manual"
}
```

### 4.1 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | `<app>.<capability>`，全局唯一 |
| `kind` | 是 | `action` / `common` |
| `app_id` | 是 | 目标小程序 AppID；common 也带 |
| `capability` | action 必填 | `register/sign_in/points/products/activities/redeem/grab/login` |
| `entry` | 是 | `adapter.ts` / `index.ts` |
| `common_version` | 否 | 依赖的应用公共模块版本 |
| `dependencies` | 否 | npm 依赖精确版本；官方源可用，custom 不允许 |
| `allowed_domains` | 是 | 允许访问的域名 |
| `default_schedule` | 否 | 默认 cron |
| `config_schema` | 否 | 配置表单 |
| `limits` | 否 | 超时/内存/日志上限 |
| `update_policy` | 否 | `manual`/`auto` |

## 5. 公共模块 manifest

```json
{
  "id": "demo.common",
  "name": "示例公共模块",
  "version": "0.1.0",
  "kind": "common",
  "app_id": "wx0000000000000000",
  "entry": "index.ts",
  "exports": ["ensureSession", "login", "getSession", "clearSession"],
  "dependencies": {},
  "notes": "登录/会话封装，不直接运行"
}
```

公共模块不创建任务、不出现在“可运行脚本”列表；只显示版本、被哪些脚本使用、更新状态。

## 6. 代码示例

### 6.1 应用公共 `demo/common/auth.ts`

```ts
import type { Context } from '@free-welfare/sdk';
import { LOGIN_PATH, SIGN_PATH, MINI_APP_ID } from './constants';

export async function login(ctx: Context): Promise<string> {
  const code = await ctx.yyb.getCode();
  const resp = await ctx.http.post('https://api.example.com' + LOGIN_PATH, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ctx.constants.wmpfUserAgent,
      Referer: `https://servicewechat.com/${MINI_APP_ID}/385/page-frame.html`,
      xweb_xhr: '1',
    },
    json: {
      code,
      appid: MINI_APP_ID,
      shoId: '',
      userId: '',
      sourceWxsceneid: 1027,
      sourceUrl: 'pages/ucenter_index/ucenter_index',
    },
  });

  if (Number(resp.data?.code) !== 200) {
    throw ctx.businessError('login_failed', resp.data?.msg || '登录失败');
  }
  const sid = String(resp.data?.data?.sid || '').trim();
  if (!sid) throw ctx.businessError('login_failed', '登录未返回 sid');
  ctx.session.set('sid', sid);
  return sid;
}

export async function ensureSession(ctx: Context): Promise<string> {
  const sid = ctx.session.get('sid');
  if (sid) return String(sid);
  return login(ctx);
}

export function clearSession(ctx: Context): void {
  ctx.session.delete('sid');
}
```

### 6.2 签到脚本 `demo/sign-in/adapter.ts`

```ts
import { defineAdapter, type Context } from '@free-welfare/sdk';
import { ensureSession, clearSession, login } from '../common/auth';

export default defineAdapter({
  async run(ctx: Context) {
    let sid = await ensureSession(ctx);

    const sign = async () =>
      ctx.http.post('https://api.example.com/customer/onSign', {
        headers: { 'Content-Type': 'application/json' },
        json: { signWay: 0, sid },
      });

    let resp = await sign();
    let message = String(resp.data?.msg || resp.data?.message || '');

    if (/登录|sid|未授权|失效|过期|未登录|401/i.test(message)) {
      clearSession(ctx);
      sid = await login(ctx);
      resp = await sign();
      message = String(resp.data?.msg || resp.data?.message || '');
    }

    if (Number(resp.data?.code) === 200) {
      const earned = Number(resp.data?.data?.points);
      return {
        ok: true,
        message: `签到成功${Number.isFinite(earned) ? `，获得 ${earned} 积分` : ''}`,
        metrics: { earned: Number.isFinite(earned) ? earned : undefined },
      };
    }
    if (/已签|签到过|重复|已完成/.test(message)) {
      return { ok: true, alreadyDone: true, message: '今日已签到' };
    }
    throw ctx.businessError('sign_failed', message || `签到失败 code=${resp.data?.code}`);
  },
});
```

### 6.3 积分脚本 `demo/points/adapter.ts`

```ts
import { defineAdapter, type Context } from '@free-welfare/sdk';
import { ensureSession } from '../common/auth';

export default defineAdapter({
  async run(ctx: Context) {
    await ensureSession(ctx);
    // TODO: 找到会员信息/积分总余额接口后替换
    const balance = Number(ctx.session.get('lastEarned') || 0);
    return {
      ok: true,
      message: '积分余额接口待补，当前为最近签到获得（估算）',
      data: { balance, estimated: true },
    };
  },
});
```

### 6.4 登录脚本 `demo/login/adapter.ts`

```ts
import { defineAdapter, type Context } from '@free-welfare/sdk';
import { login } from '../common/auth';

export default defineAdapter({
  async run(ctx: Context) {
    const sid = await login(ctx);
    return { ok: true, message: '登录成功', data: { hasSession: Boolean(sid) } };
  },
});
```

## 7. 构建与导入

- 源码里用相对路径/workspace 导入公共模块。
- CI 用 esbuild 把 **应用公共模块** 打进每个功能脚本的 bundle；版本固定为 `common_version`。
- 第三方 npm 依赖标记 external，由平台依赖集合安装/复用。
- 功能脚本 bundle 自包含公共逻辑；平台不需要在运行时解析 `../common`。
- 更新公共模块时，CI 重新构建依赖它的功能脚本，发布新版本；平台显示“公共模块更新，关联脚本可更新”。

> 这样源码是“公共模块复用”，运行时是“自包含 bundle”，避免路径/版本解析问题。

## 7.5 网络根 URL / 白名单

每个应用在 `analysis/packages/<key>/metadata.yaml` 和平台应用信息里记录：

```yaml
network:
  mode: whitelist
  root_urls:
    - id: api
      url: https://api.example.com
      purpose: 登录/签到/积分/商品
      path_prefix: ""
      used_by: [auth, sign_in, points, products]
      required: true
  allowed_origins:
    - https://api.example.com
```

- 一个应用可以有多个根 URL；只有脚本真正需要的才加入 `allowed_origins`。
- 脚本 manifest 的 `allowed_domains` 只能缩小应用白名单，不能扩大。
- 应用可以设 `network_mode=unrestricted`，但需二次确认；仍拦截私网/回环/元数据。
- 脚本只能通过 `ctx.http` 发请求；common 里的 http 封装也必须基于 `ctx.http`。
- 代理层统一做白名单、SSRF、限流、审计、脱敏。详见 [12 网络策略](12-network-policy.md)。

## 8. 平台管理

### 8.1 应用详情

```text
应用：示例应用
  应用信息：名称/AppID/图标/分类
  账号：绑定的微信账号
  功能脚本：
    ✅ 登录        v0.1.0
    ✅ 签到        v0.1.0   每天 08:43
    ✅ 积分        v0.1.0   每天 09:10
    ⏸ 商品        v0.1.0   待接口
    ⏸ 活动        v0.1.0   待接口
    ⏸ 注册        —        待确认
  公共模块：
    示例公共模块   v0.1.0   被 3 个脚本使用
  依赖：
    crypto-js 4.2.0（如有）
```

### 8.2 操作

- 每个功能脚本：启用/停用、运行、编辑配置、调度、查看日志、更新、回滚。
- 公共模块：查看版本/被依赖关系；不能直接运行。
- 源更新：同步 index；显示功能脚本/公共模块的新版本；更新公共模块后提示关联脚本更新。
- 任务：可以单脚本执行，也可以配置“每日流程”（如签到 + 积分）。

### 8.3 任务流程

```text
每日签到流程
  1. sign_in（内部 ensureSession，必要时自动登录）
  2. points（读取余额/估算）
```

- 登录通常不需要单独任务；由 `ensureSession` 自动处理。
- `login` 脚本用于手动测试/首次绑定/注册流程。
- 需要注册的站点：`register` → `login` → `sign_in`。

## 9. 与数据分析目录的关系

`analysis/packages/<key>/` 文档应列出：

- 计划的功能脚本（register/login/sign_in/points/products/activities）；
- 公共模块（auth/crypto/http）；
- 每个功能对应的接口、字段、错误码；
- 积分规则/有效期；
- 加密/签名。

写脚本时只读分析文档 + 模板，不需要重新解包。

## 10. 数据模型调整

在 [04 领域模型](04-domain-and-data-model.md) 基础上：

- `scripts.kind`：`action` / `common`
- `scripts.capability`：单个能力（action）
- `scripts.common_version`：应用公共模块版本
- `script_versions.manifest` 保存完整 manifest
- `script_versions.bundle_path/hash`
- `bindings` 只绑定 action 脚本；common 不绑定
- `tasks` 只引用 action 脚本
- 可加 `script_dependencies` 表记录公共模块/第三方依赖关系（可选）

## 11. 待确认

- 公共模块版本更新时，是否自动重建/发布关联脚本？（建议 CI 自动，平台提示更新）
- 是否允许一个功能脚本声明多个能力？（建议不允许，保持一功能一脚本）
- 注册脚本是否首期实现？（示例应用是否需要注册待确认）
- 任务流程是否需要“多脚本编排”UI？（建议首期单脚本 + 签到内自动登录）
