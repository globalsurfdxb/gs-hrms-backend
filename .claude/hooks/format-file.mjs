// PostToolUse hook: format the file Claude just edited with the repo's Prettier config, so every developer's
// Claude output is formatted identically. Never blocks: formatting problems are left for `npm run check`.
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

try {
  const file = JSON.parse(input)?.tool_input?.file_path;
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  if (typeof file === 'string') {
    const rel = relative(root, resolve(file));
    const inRepo = !rel.startsWith('..') && !rel.startsWith('src/generated') && !rel.startsWith('node_modules');
    if (inRepo && /\.(ts|js|mjs|cjs|json|md|ya?ml)$/.test(rel)) {
      execFileSync('npx', ['prettier', '--write', '--ignore-unknown', rel], { cwd: root, stdio: 'ignore' });
    }
  }
} catch {
  // ignore — never block the session on formatting
}
