// Poliplast App (prueba, 25/11): en el link de prueba (rama poliplast-app) se suman las maquetas REALES de otras
// apps con datos de ejemplo, para verlas con su propio diseño dentro del menú. En main no hace nada.
// - Entregas: la carpeta entregas/ compilada en modo maqueta → dist/entregas-maqueta/
// - App de conteo: demo/conteo-maqueta/ (compilada desde su repo) → dist/conteo-maqueta/
import { execSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';

const branch = process.env.VERCEL_GIT_COMMIT_REF || '';
const wanted = branch === 'poliplast-app' || process.env.DEMO_EXTRAS === '1';
if (!wanted) {
  console.log('build-demo-extras: no es el link de prueba, no se suma nada.');
  process.exit(0);
}
const run = (command, cwd) => execSync(command, { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } });
try {
  if (!existsSync('entregas/node_modules')) run('npm ci --no-audit --no-fund', 'entregas');
  run('npx vite build --mode maqueta --base=/entregas-maqueta/ --outDir ../dist/entregas-maqueta --emptyOutDir', 'entregas');
  console.log('build-demo-extras: Entregas (maqueta) lista en /entregas-maqueta/.');
  // App de conteo (Etiquetas, Conteo, Dosificado): maqueta ya compilada desde su repo (scripts/update-conteo-maqueta.sh).
  if (existsSync('demo/conteo-maqueta/index.html')) {
    cpSync('demo/conteo-maqueta', 'dist/conteo-maqueta', { recursive: true });
    console.log('build-demo-extras: app de conteo (maqueta) lista en /conteo-maqueta/.');
  }
} catch (error) {
  // Si falla, el link de prueba sale igual (Entregas queda con la tabla simple).
  console.error('build-demo-extras: no se pudo compilar la maqueta de Entregas:', error.message);
}
