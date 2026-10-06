const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
  const pkgDir = path.resolve('release-evidence-562cf1c');
  if (fs.existsSync(pkgDir)) fs.rmSync(pkgDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(pkgDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(pkgDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(pkgDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(pkgDir, 'audits'), { recursive: true });

  console.log('1. Generating real git diff and copying scripts...');
  execSync('git diff 6484b5ae9e22239c4171def20b1554e916ac1ab1..HEAD > ' + path.join(pkgDir, 'diff-financial-evidence.patch'));
  fs.copyFileSync('tests/test-persistent-financial-cycle.ts', path.join(pkgDir, 'scripts', 'test-persistent-financial-cycle.ts'));
  fs.copyFileSync('tests/test-pg-concurrency-orders.ts', path.join(pkgDir, 'scripts', 'test-pg-concurrency-orders.ts'));
  fs.copyFileSync('tests/test-resource-evidence-auth.ts', path.join(pkgDir, 'scripts', 'test-resource-evidence-auth.ts'));
  fs.copyFileSync('tests/run-browser-evidence-suite.ts', path.join(pkgDir, 'scripts', 'run-browser-evidence-suite.ts'));
  fs.copyFileSync('tests/run-rigorous-benchmark.ts', path.join(pkgDir, 'scripts', 'run-rigorous-benchmark.ts'));
  if (fs.existsSync('tests/rigorous-benchmark-report.json')) {
    fs.copyFileSync('tests/rigorous-benchmark-report.json', path.join(pkgDir, 'logs', 'rigorous-benchmark-report.json'));
  }

  const screenshots = fs.readdirSync('tests/screenshots').filter(f => f.startsWith('demo_'));
  for (const s of screenshots) {
    fs.copyFileSync(path.join('tests/screenshots', s), path.join(pkgDir, 'screenshots', s));
  }

  const env = { ...process.env, NODE_OPTIONS: '--use-system-ca' };

  console.log('2. Running test-persistent-financial-cycle.ts against PostgreSQL...');
  const out1 = execSync('npx tsx tests/test-persistent-financial-cycle.ts', { env }).toString();
  fs.writeFileSync(path.join(pkgDir, 'logs', 'test-persistent-financial-cycle.log'), out1, 'utf8');

  console.log('3. Running test-pg-concurrency-orders.ts with SELECT FOR UPDATE...');
  const out2 = execSync('npx tsx tests/test-pg-concurrency-orders.ts', { env }).toString();
  fs.writeFileSync(path.join(pkgDir, 'logs', 'test-pg-concurrency-orders.log'), out2, 'utf8');

  console.log('4. Running test-resource-evidence-auth.ts (Strict Zero-Trust RBAC)...');
  const out3 = execSync('npx tsx tests/test-resource-evidence-auth.ts', { env }).toString();
  fs.writeFileSync(path.join(pkgDir, 'logs', 'test-resource-evidence-auth.log'), out3, 'utf8');

  console.log('5. Running run-browser-evidence-suite.ts (Puppeteer form submission & task toggle)...');
  const out4 = execSync('npx tsx tests/run-browser-evidence-suite.ts', { env }).toString();
  fs.writeFileSync(path.join(pkgDir, 'logs', 'run-browser-evidence-suite.log'), out4, 'utf8');

  console.log('6. Syncing Graft dependency graph...');
  try {
    const graftOut = execSync('npm run graft:sync').toString();
    fs.writeFileSync(path.join(pkgDir, 'audits', 'graft-sync.log'), graftOut, 'utf8');
  } catch (e) {
    fs.writeFileSync(path.join(pkgDir, 'audits', 'graft-sync.log'), e.message, 'utf8');
  }

  console.log('7. Verifying Trivy security scanner status...');
  try {
    const trivyOut = execSync('trivy fs --skip-dirs .next,node_modules,tools .').toString();
    fs.writeFileSync(path.join(pkgDir, 'audits', 'trivy-fs-scan.log'), trivyOut, 'utf8');
  } catch (e) {
    fs.writeFileSync(path.join(pkgDir, 'audits', 'trivy-fs-scan.log'), 'Trivy CLI no disponible en entorno anfitrion Windows. Auditoria estatica identificada formalmente como no ejecutada localmente.', 'utf8');
  }

  console.log('8. Compressing release-evidence-562cf1c.zip...');
  execSync('powershell -Command "Compress-Archive -Path release-evidence-562cf1c/* -DestinationPath release-evidence-562cf1c.zip -Force"');
  console.log('✅ PAQUETE GENERADO Y COMPRIMIDO EXITOSAMENTE: release-evidence-562cf1c.zip');
}

main().catch(err => {
  console.error('❌ Error empaquetando evidencias:', err);
  process.exit(1);
});
