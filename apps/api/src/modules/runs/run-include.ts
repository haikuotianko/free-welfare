import type { Prisma } from '@free-welfare/db';

/** 运行列表 / SSE 共用的关联数据，保证推送和 REST 返回结构一致。 */
export const runInclude = {
  task: {
    include: {
      binding: {
        include: {
          site: true,
          siteAccount: { include: { wechatAccount: true } },
          script: true,
        },
      },
    },
  },
  siteScript: true,
  site: true,
  siteAccount: { include: { wechatAccount: true } },
} satisfies Prisma.RunInclude;
