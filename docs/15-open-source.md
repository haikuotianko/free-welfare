# 15 开源治理

本文定义 Free Welfare 开源后的许可证、版本、贡献、发布和安全流程。

## 1. 许可证

- 项目使用 **MIT License**。
- 允许使用、复制、修改、合并、发布、分发、再许可、销售。
- 需保留版权声明和许可证文本。
- 贡献者提交 PR 即同意按 MIT 发布其贡献。
- 依赖/脚本/分析产物需遵守各自许可证；不要提交无授权代码。

## 2. 仓库划分

| 仓库 | 内容 | 发布 |
| --- | --- | --- |
| `free-welfare` | 平台代码、文档、分析目录 | Docker 镜像/Release |
| `free-welfare-scripts` | 官方脚本、manifest、index | 脚本版本/index |
| 用户自己的 fork | 自定义脚本/部署 | 自行维护 |

建议脚本独立仓库，原因：

- 脚本更新频率高于平台；
- 审核/CI 独立；
- 用户可以只订阅脚本；
- 平台不需要重新发版。

## 3. 版本

### 3.1 平台

- SemVer：`MAJOR.MINOR.PATCH`。
- MAJOR：破坏性 API/配置/数据库迁移。
- MINOR：新功能，向后兼容。
- PATCH：修 bug/文档。
- Docker tag：`latest`、`vX.Y.Z`、`X.Y`。
- 数据库迁移随版本；升级前备份。

### 3.2 脚本

- 每个脚本独立版本，manifest `version`。
- 公共模块独立版本，`common_version` 固定。
- index 记录 `version`、`sha256`、`bundle`、`changelog`、`review_status`。
- 脚本更新手动确认（默认）；`reviewed` 可配置自动。

### 3.3 变更记录

- `CHANGELOG.md`：平台。
- 脚本 `README`/`changelog`：脚本。
- 数据库迁移：`prisma/migrations` + 升级说明。

## 4. 分支与提交

- 主分支：`main`，始终可构建。
- 功能分支：`feat/<scope>`、`fix/<scope>`、`docs/<scope>`。
- 提交：Conventional Commits：
  - `feat(api): add site network policy`
  - `fix(worker): retry only network errors`
  - `docs(script): document sanf getPoint`
  - `chore(deps): bump ...`
- PR 小而聚焦；一个 PR 一件事。
- 不直接 push main；PR + CI + 至少 1 个维护者审核。

## 5. PR 检查

- [ ] 关联 Issue/需求。
- [ ] 类型安全；无未解释 `any`。
- [ ] 单元/集成测试。
- [ ] 错误码/日志/脱敏。
- [ ] 网络请求走 SDK/白名单。
- [ ] 文档/ADR 更新。
- [ ] 不提交 `.env`/`data/`/HAR/wxapkg/真实账号。
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 通过。
- [ ] 依赖许可证/必要性说明。

## 6. Issue

建议模板：

- Bug：版本、部署方式、复现步骤、脱敏日志、预期/实际。
- Feature：场景、需求、替代方案、是否愿意 PR。
- Script request：小程序名称/AppID、功能、是否有 HAR/解包、风险。
- Security：不要公开；走 `SECURITY.md`。

## 7. 脚本贡献

### 7.1 提交流程

1. Fork `free-welfare-scripts`。
2. 新建 `scripts/<app>/<function>/`。
3. 写 `manifest.json`、`adapter.ts`、`README.md`、测试/脱敏 fixture。
4. 本地 `pnpm test`/`pnpm build`。
5. 提 PR；CI 校验；维护者审核。
6. 合并后 CI 生成 index/版本。

### 7.2 审核清单

- [ ] 接口来源合法、可复现。
- [ ] 只访问 `allowed_domains`。
- [ ] 无硬编码 token/手机号/账号。
- [ ] 登录/签到/领取幂等。
- [ ] 错误分类/重试正确。
- [ ] 写操作先查后写、写后复查。
- [ ] 不绕过验证码/风控/支付。
- [ ] 有脱敏 fixture/测试。
- [ ] README 说明限制/风险。
- [ ] 依赖必要、版本固定、无 postinstall。

### 7.3 脚本结构

```text
scripts/sanf/
  common/
  login/
  sign-in/
  points/
  products/
  activities/
```

一功能一脚本；公共逻辑放 common；具体见 [11 脚本结构](11-script-structure.md)。

## 8. 分析贡献

- `analysis/packages/<key>/`：metadata + docs。
- 不提交解包代码/HAR/截图/真实账号。
- 文档区分“已验证/待确认”。
- 根 URL/加密/积分有效期/商品/活动必须写清楚。
- 解包工具二进制放 `analysis/tools/*/bin/`（gitignore）。

## 9. 安全

- 漏洞不要公开 Issue；按 [SECURITY](../SECURITY.md) 私下报告。
- 不提交 secret；使用 `.env.example`。
- 脚本 PR 被视为代码执行，审核从严。
- 发现供应链/沙箱问题优先修，不等待下一个 feature。
- 发布安全公告时说明影响版本/缓解措施。

## 10. 发布流程

```text
1. 确认 main CI 绿
2. 更新 CHANGELOG/版本
3. 数据库迁移检查/备份说明
4. 构建 arm64/amd64 镜像
5. 打 tag / GitHub Release
6. 发布脚本 index（如需要）
7. 公告：升级步骤/已知问题
```

发布后：

- 观察 issue/运行失败；
- 必要时 patch；
- 保留上一个镜像 tag 便于回滚。

## 11. 治理

- 维护者：合并 PR、发布、处理安全报告。
- 决策：ADR（`docs/decisions.md`）；重大变更先讨论。
- 争议：以“安全、可维护、对自托管用户友好”为优先级。
- 不追求多租户/SaaS；保持自托管定位。
- 脚本审核由维护者负责；社区可 review。

## 12. 行为准则

- 尊重、具体、对事不对人。
- 不提交他人账号/隐私/未授权代码。
- 不讨论/协助批量注册、接码、绕过风控。
- 安全/合规问题按文档边界处理。

## 13. 不要提交

- `.env`、`data/`、数据库、日志。
- `*.wxapkg`、HAR、解包代码、截图。
- 真实 token/cookie/手机号/OpenID/sessionKey。
- 无许可证的第三方代码。
- 构建产物/`node_modules`。

## 14. Fork/二次开发

- 允许闭源/商业二次开发（MIT）。
- 请保留版权/许可证声明。
- 修改脚本/平台后自行承担账号/合规风险。
- 建议把通用改进回馈上游，减少分叉。
