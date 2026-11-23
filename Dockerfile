FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# 只安装 API / Worker 运行所需的依赖；Web 只保留构建后的静态文件。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/db/prisma packages/db/prisma
RUN pnpm install --prod --frozen-lockfile --filter @free-welfare/api... --filter @free-welfare/worker... \
  && pnpm --filter @free-welfare/db generate \
  && rm -rf \
       /app/node_modules/.pnpm/prisma@*/node_modules/prisma/prisma-client \
       /app/node_modules/.pnpm/prisma@*/node_modules/prisma/libquery_engine-*.so.node \
       /app/node_modules/.pnpm/prisma@*/node_modules/prisma/build/query_engine_bg.*.wasm \
       /app/node_modules/.pnpm/prisma@*/node_modules/prisma/build/query_compiler_bg.*.wasm \
       /app/node_modules/.pnpm/prisma@*/node_modules/prisma/build/public \
       /app/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/libquery_engine-*.so.node \
  && find /app/node_modules -type f \( -name '*.map' -o -name '*.d.ts' \) -delete \
  && rm -rf \
       /root/.cache \
       /root/.local/share/pnpm \
       /usr/local/lib/node_modules/npm \
       /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm \
       /usr/local/bin/npx \
       /usr/local/bin/corepack \
       /usr/local/bin/pnpm \
       /usr/local/bin/pnpx \
       /usr/local/include/node

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/sdk/dist packages/sdk/dist
COPY --from=build /app/tools/migrate.mjs tools/migrate.mjs

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
