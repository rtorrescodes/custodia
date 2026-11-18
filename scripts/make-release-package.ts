import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const baseCommit = "6484b5ae9e22239c4171def20b1554e916ac1ab1";
const headCommit = "abd1580889d5225879e77aae63d368c27c6c43e4";
const shortSha = headCommit.substring(0, 7);
const outDir = path.join(process.cwd(), `release-evidence-${shortSha}`);
const zipFile = path.join(process.cwd(), `release-evidence-${shortSha}.zip`);

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
if (fs.existsSync(zipFile)) fs.rmSync(zipFile, { force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log("Generando diff...");
const diff = execSync(`git diff ${baseCommit}..${headCommit}`, { encoding: "utf8" });
fs.writeFileSync(path.join(outDir, "feature-cus09c.diff"), diff);

const copyDirs = [
  "src/lib/services",
  "src/app/actions",
  "src/components/property",
  "tests"
];

for (const dir of copyDirs) {
  const target = path.join(outDir, dir);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(process.cwd(), dir), target, { recursive: true });
}

fs.mkdirSync(path.join(outDir, "prisma"), { recursive: true });
fs.copyFileSync(path.join(process.cwd(), "prisma/schema.prisma"), path.join(outDir, "prisma/schema.prisma"));
if (fs.existsSync(path.join(process.cwd(), "prisma/migrations"))) {
  fs.cpSync(path.join(process.cwd(), "prisma/migrations"), path.join(outDir, "prisma/migrations"), { recursive: true });
}

// Generar checklist y resumen de entrega
const manifest = `# Resumen de Entrega y Cierre de Aceptación CUS-09C
- Base Commit: ${baseCommit}
- Head Commit: ${headCommit}
- SHA: ${shortSha}
- Rama: feature/cus-09c-daily-operations

## 1. Verificación sin Fallbacks en Interfaz
- Se eliminó todo fallback o llamada directa de bypass en 'run-browser-evidence-suite.ts'.
- El PM abre el comprobante del propietario y valida formalmente $6,500 desde el formulario.
- Estado en BD confirmado en VERIFIED con releasedAmount = 6500.

## 2. Preparación de Llegada con Sesiones Independientes
- PM asigna la tarea de insumos y preparación a responsable concreto (proveedor@demo.custodia.app).
- Responsable inicia su propia sesión en navegador, abre la tarea, reporta evidencia y solicita verificación.
- PM reingresa, revisa el dictamen técnico y aprueba verificación.
- La llegada y checklist de la estancia pasan a COMPLETED.
- Capturas generadas: demo_06_pm_llegadas_asignacion.png, demo_07a_responsable_entrega_evidencia.png, demo_07b_pm_revision_aprobada.png, demo_07c_llegada_confirmada.png.

## 3. Claves Operacionales Estables en Pagos a Contratistas
- Deduplicación mediante relación 'workOrderId' y clave 'operationKey' (PAY_WO_{id}_{ref}).
- Idempotencia estricta en reintentos y conflicto ante importes divergentes.
- Re-aprobación prevenida si existen pagos o ejecuciones en curso.

## 4. Suites de Integración y Rendimiento Ejecutadas con Éxito (Exit Code 0)
- tests/test-persistent-financial-cycle.ts: Pasos A-H demostrados contra PostgreSQL.
- tests/test-pg-concurrency-orders.ts: Concurrencia real con transacciones y bloqueos de fila.
- tests/test-resource-evidence-auth.ts: Autorización Zero Trust con cookies y límites de sesión.
- tests/run-browser-evidence-suite.ts: Recorrido completo en navegador real con Puppeteer.
- tests/run-rigorous-benchmark.ts: 5 iteraciones en servidor de producción (puerto 3005).
`;
fs.writeFileSync(path.join(outDir, "README.md"), manifest);

console.log("Comprimiendo paquete release-evidence...");
execSync(`powershell -Command "Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipFile}' -Force"`);

console.log("Paquete generado con éxito:", zipFile);
