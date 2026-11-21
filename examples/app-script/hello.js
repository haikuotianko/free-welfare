// 应用脚本模板
// 放到 data/apps/<siteKey>/scripts/hello.js，然后在应用详情添加脚本条目。
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
      data: {
        app: ctx.app.name,
        account: ctx.account.yybRef,
      },
    };
  },
};
