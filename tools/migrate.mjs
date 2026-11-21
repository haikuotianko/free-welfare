import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const schema = join(root, 'packages', 'db', 'prisma', 'schema.prisma');
const candidates = [
  join(root, 'node_modules', 'prisma', 'build', 'index.js'),
  join(root, 'packages', 'db', 'node_modules', 'prisma', 'build', 'index.js'),
];
const cli = candidates.find((candidate) => existsSync(candidate));

if (!cli) {
  console.error('找不到 Prisma CLI，请先执行 npm ci / pnpm install');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
