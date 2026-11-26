// Poliplast App (prueba, 25/11): en el link de prueba (rama poliplast-app) se suman las maquetas REALES de otras
// apps con datos de ejemplo, para verlas con su propio diseño dentro del menú. En main no hace nada.
// - Entregas: la carpeta entregas/ compilada en modo maqueta → dist/entregas-maqueta/
// - Entregas real (con la base de la rama de prueba) → dist/entregas-app/
// - App de conteo: demo/conteo-maqueta/ (compilada desde su repo) → dist/conteo-maqueta/
import { execSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';

const branch = process.env.VERCEL_GIT_COMMIT_REF || '';
const wanted = branch === 'poliplast-app' || process.env.DEMO_EXTRAS === '1';
if (!wanted) {
  console.log('build-demo-extras: no es el link de prueba, no se suma nada.');
  process.exit(0);
}
// npm ci con NODE_ENV=development para que instale vite (devDependency); los builds van en producción.
const run = (command, cwd) => execSync(command, { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: command.startsWith('npm ci') ? 'development' : 'production' } });
try {
  if (!existsSync('entregas/node_modules')) run('npm ci --no-audit --no-fund', 'entregas');
  run('npx vite build --mode maqueta --base=/entregas-maqueta/ --outDir ../dist/entregas-maqueta --emptyOutDir', 'entregas');
  console.log('build-demo-extras: Entregas (maqueta) lista en /entregas-maqueta/.');
  // Entregas REAL en el mismo link (comparte la sesión de la app: mismo origen), si hay base conectada.
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    run('npx vite build --base=/entregas-app/ --outDir ../dist/entregas-app --emptyOutDir', 'entregas');
    console.log('build-demo-extras: Entregas (real) lista en /entregas-app/.');
  }
  // App de conteo (Etiquetas, Conteo, Dosificado): maqueta ya compilada desde su repo (scripts/update-conteo-maqueta.sh).
  if (existsSync('demo/conteo-maqueta/index.html')) {
    cpSync('demo/conteo-maqueta', 'dist/conteo-maqueta', { recursive: true });
    console.log('build-demo-extras: app de conteo (maqueta) lista en /conteo-maqueta/.');
  }
} catch (error) {
  // Si falla, el link de prueba sale igual (Entregas queda con la tabla simple).
  console.error('build-demo-extras: no se pudo compilar la maqueta de Entregas:', error.message);
}
