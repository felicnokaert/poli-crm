// Hook de Claude Code: antes de subir a GitHub (git push) corre los tests y la compilación del
// proyecto. Si algo falla, frena la subida: así no se publica algo roto ni se gasta una de las
// 100 publicaciones diarias de Vercel.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const command = String(input.tool_input?.command || '');
  if (!/\bgit\b[^;&|]*\bpush\b/.test(command)) process.exit(0);
  // Solo para este repo (las subidas se hacen desde la carpeta principal).
  const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  rmSync(join(dir, 'test', '.jsx-cache'), { recursive: true, force: true });
  for (const [label, cmd] of [['tests', 'npm test'], ['compilación', 'npm run build']]) {
    try {
      execSync(cmd, { cwd: dir, stdio: 'pipe', timeout: 480000, maxBuffer: 64 * 1024 * 1024 });
    } catch (failure) {
      const out = `${failure.stdout || ''}\n${failure.stderr || ''}`;
      const tail = out.split('\n').filter((line) => /^\s*✖|^ℹ fail\b|error during build|\[vite\]/i.test(line)).slice(0, 20).join('\n');
      process.stderr.write(`Subida frenada: fallaron los ${label} (${cmd}).\n${tail || out.slice(-2000)}\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
