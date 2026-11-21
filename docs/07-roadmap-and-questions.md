# 07 路线图与待确认问题

## 1. 已确定的决策

| 项 | 决策 |
| --- | --- |
| 产品形态 | 个人/小团队自托管，后期开源；不做多租户 SaaS |
| 后端 | NestJS + Fastify + Prisma + PostgreSQL + pg-boss |
| 前端 | Vue 3 + TypeScript + Vite + TailwindCSS + reka-ui/shadcn-vue |
| 脚本 | JS/TS；Node `worker_threads` + `vm`；官方源审核，custom 限制 |
| 脚本分发 | GitHub 订阅源；其他用户 PR，维护者审核；版本/hash/回滚 |
| 脚本结构 | 一功能一脚本（登录/签到/积分/商品/活动/注册）+ 公共模块（auth/crypto/http） |
| 网络策略 | 应用级根 URL + 白名单/不限制；脚本只能走 SDK `ctx.http` |
| 脚本依赖 | manifest `dependencies`；平台统一安装/复用；`--ignore-scripts` |
| 自定义源 | 支持；`custom` 禁止 `dependencies/require`，只用 `ctx` API；强警告 |
| 订阅签名 | 不做 |
| 更新策略 | 按脚本配置 `manual`/`auto`；custom 强制 manual |
| YYB | 每个使用者自己部署；平台通过 `/integration/*` 连接 |
| 首个脚本 | 三福会员签到 `sanf`，AppID `wxfe13a2a5df88b058` |
| MVP 能力 | 签到 + 积分余额/过期 + 商品/活动读取（Phase 2） |
| 数据库/ORM | PostgreSQL 16 + Prisma + pg-boss |
| 脚本范围 | TS + JS；官方源 + 自定义源（custom 禁用 dependencies/require） |
| 三福首版 | 签到 + 积分；商品/活动后补 |
| 许可证 | MIT |
| 部署 | Linux ARM64 NAS + Docker Compose + 内网/VPN |
| 通知 | Server酱 |
| 调试 | WMPFDebugger + KillWxapkg + 抓包 |
| 运行时细节 | 见 [09 脚本运行时](09-script-runtime.md) |
| 界面/功能 | 见 [10 界面与功能](10-ui-feature-plan.md) |
| 脚本结构 | 见 [11 脚本结构](11-script-structure.md)：一功能一脚本 + 公共模块 |
| 网络策略 | 见 [12 网络策略](12-network-policy.md)：根 URL、白名单/不限制、SDK 请求 |

## 2. 分阶段计划

> 时间是粗略估算，按 1 名熟悉技术栈的开发者计算；实际取决于三福商品/活动接口难度。

### Phase 0：脚手架与基础设施（2-4 天）

- pnpm monorepo：`apps/api`（NestJS）、`apps/web`（Vue）、`packages/shared`、`packages/sdk`。
- Docker Compose：api/worker/postgres/caddy。
- Prisma schema + 初始迁移。
- 首次启动向导：管理员、YYB 配置。
- 登录/会话、基础布局（移动底部导航/桌面侧边栏）。
- pg-boss 初始化、健康检查。
- YYB `/integration/accounts` 同步。

**验收**：ARM64 上 `docker compose up -d` 能打开登录页，创建管理员，连接 YYB，看到账号列表。

### Phase 1：三福签到 MVP（1-2 周）

- 三福站点 + 脚本安装（先内置/本地源）。
- `login`：code -> `sid`。
- `sign_in`：签到、已签到、会话失效重登一次。
- `points`：积分余额/即将过期/截止日期（`getPoint`）、连签天数。
- 任务：每日 cron、手动执行、停止。
- 运行记录/日志/SSE tail。
- 首页：今日签到、积分、失败原因。
- Server酱通知。
- 脚本配置/session 加密。

**验收**：真实账号每日自动签到；手机能看到结果；重复运行不重复签到；失败通知；日志无 code/sid。

### Phase 2：脚本订阅与资产视图（1-2 周）

- GitHub 订阅源 `index.json` 同步。
- 脚本安装/更新/回滚/hash 校验。
- 三福商品/活动接口：KillWxapkg 解包 + WMPFDebugger 抓包。
- 商品列表/活动列表/积分规则（能拿多少拿多少）。
- 积分批次/过期提醒（有数据时）。
- 应用详情商品/活动 Tab（脚本声明能力后显示）。
- 更多脚本模板/文档。

**验收**：能从订阅源安装/更新三福脚本；能看到商品/活动；积分过期有提醒（有数据时）。

### Phase 3：兑换/抢购/兼容（后续）

- 纯积分兑换（需支付则暂停人工）。
- 抢购任务：预热、精确定时、限流、结果通知。
- 旧青龙脚本兼容（`YYB_SERVER` 代理）——只在可信/审核场景。
- 自定义订阅源（强警告）。
- 多账号批量。

**验收**：能完成一次纯积分兑换；抢购按时间执行并给明确结果；旧脚本可迁移。

### Phase 4：加固与开源发布

- 备份/恢复自动化。
- 审计、日志保留、磁盘告警。
- 可选更强沙箱（Deno/容器）。
- 开源文档、贡献指南、脚本模板、CI。
- 多架构镜像/Release。

## 3. MVP 范围（建议）

只做：

- 单管理员、1-3 个微信账号。
- 三福脚本：login/sign_in/points。
- 每日签到 + 手动执行 + 日志 + Server酱。
- 移动端首页/账号/脚本/运行详情。
- ARM64 Docker Compose。

暂不做：

- 商品/活动（除非接口很快补齐）。
- 兑换/抢购。
- 旧脚本兼容。
- 多用户/家庭共享。
- 更强沙箱。

> 商品/活动依赖解包/抓包结果；如果 Phase 1 期间能拿到接口，就并入 MVP，否则 Phase 2。

## 4. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 三福接口变更 | 脚本失效 | 版本化、错误分类、快速回滚、运行告警 |
| YYB 授权失效 | 无法取码 | 状态同步、409 识别、重扫引导、通知 |
| 验证码/风控 | 自动化中断 | 暂停任务、通知人工、不绕过 |
| 会话过期 | 签到失败 | 自动重登一次、失败分类、不无限重试 |
| 积分有效期拿不到 | 无法精确提醒 | 余额+规则估算，标记估算 |
| 脚本供应链投毒 | 服务器/账号风险 | 只运行 reviewed、hash、审核、CI、最小注入 |
| Node vm 逃逸 | 服务器风险 | 不运行未审核脚本；后续 Deno/容器 |
| ARM64 资源不足 | OOM/卡顿 | 2GB 最低/4GB 推荐；限制 worker 内存/并发 |
| 平台规则/封号 | 账号损失 | 保守频率、只操作本人账号、风险提示 |

## 5. 剩余待确认

以下不阻塞脚手架，但会影响 Phase 1/2：

### Q1. 三福会员信息/商品/活动接口

- 你能否用 KillWxapkg 解包并抓包，提供脱敏请求？
- 需要我写一份“解包 + 抓包 + 找接口”的详细步骤？
- 重点：积分总余额、积分规则/有效期、商品/权益列表、活动/任务列表。

> 已确认首版先做签到 + 积分；这些接口 Phase 2 补。

### Q2. Server酱细节

- 用 Server酱 Turbo 还是旧版？
- token 在设置里填（加密保存），还是走环境变量？
- 事件默认：失败 + 账号失效 + 脚本更新；是否还要每日成功摘要？

> 默认：设置里填 token；失败 + 账号失效 + 脚本更新。

### Q3. NAS 部署细节

- 是否已有 YYB 容器？容器名/网络名是什么？
- 是否已有 Caddy/Nginx/反向代理？
- 只用内网/VPN，还是需要公网域名/HTTPS？

### Q4. 旧脚本

- 默认 Phase 3：旧青龙脚本兼容（`YYB_SERVER` 代理）。
- 首期只做平台 TS/JS 脚本。
- 如果你希望首期就兼容 `sanf.js` 的 `YYB_SERVER` 写法，需要提前说。

## 6. 决策记录模板

后续每个决策追加到 `docs/decisions.md`：

```markdown
## ADR-0001: 使用 NestJS + PostgreSQL + pg-boss

- 日期：2026-11-13
- 状态：接受
- 背景：...
- 决策：...
- 备选：...
- 影响：...
```
