# 应用脚本示例

这个目录放可以直接复制到 `data/apps/<siteKey>/scripts/` 的 CommonJS 脚本模板。

## hello.js

最小脚本：

```js
module.exports = {
  async run(ctx) {
    ctx.log.info('hello');
    return { ok: true, message: 'hello' };
  },
};
```

## 使用步骤

1. 把文件复制到 `data/apps/<siteKey>/scripts/Hello.js`
2. 打开应用详情 → 脚本文件，确认能看到该文件
3. 应用脚本 → 添加脚本，选择文件，填写名称/参数/启用
4. 绑定微信账号
5. 点“运行”
6. 在“运行”页查看日志和结果

## 脚本约定

- 文件必须是 CommonJS：`module.exports = { run }`
- `run(ctx)` 可以是 async
- 返回值应是 `{ ok, message, data?, metrics?, alreadyDone? }`
- 业务失败用 `throw ctx.businessError(code, message)` 或 `throw ctx.authExpired(...)`
- 需要复用代码时，在脚本目录放 `common.js`，用 `require('./common')` 引用
- 平台模式不允许 `fs`、`net`、`child_process` 等内置模块；HTTP 走 `ctx.http`
- 网络必须先加入应用根 URL 白名单

完整 API 见 [docs/19-script-sdk.md](../../docs/19-script-sdk.md)，开发流程见 [docs/20-script-development-guide.md](../../docs/20-script-development-guide.md)。
