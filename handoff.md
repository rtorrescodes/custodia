# Custodia Handoff — CUS-09: Operación Completa del Inmueble y Control de Cartera

## 1. Objetivo y Alcance
Implementación integral de **CUS-09 — Operación Completa del Inmueble y Control de Cartera**:
- Núcleo unificado para los tres escenarios residenciales:
  1. Vivienda con arrendamiento residencial activo.
  2. Casa de propietario ausente bajo cuidado y custodia de un PM.
  3. Propiedad vacante en conservación preventiva y preparación para siguiente ocupante.
- Correcciones mandatorias de seguridad y fidelidad:
  - **A1. Fideicomiso real**: Eliminación de la equivalencia entre reserva mínima y autorización de gasto. Separación estricta de saldo, reserva, fondos comprometidos y fondos disponibles, con facultad máxima de gasto del PM (`pmExpenseLimit`) y flujo de aportaciones del dueño.
  - **A2. Traducción honesta**: Eliminación de sustituciones y mocks parciales. Si no hay proveedor real configurado, preserva el original íntegro y declara `status: "NOT_AVAILABLE"`.
  - **A3. Bóveda Zero-Trust**: Secretos enmascarados por defecto (`••••••••`). Revelado auditado en servidor (`revealVaultSecretAction`) con inserción inmutable en `VaultAccessAudit` sin registrar el valor sensible.
- Bandeja de atención de cartera (`/cartera`) para gestión de alertas, tareas vencidas, decisiones de propietarios y visitas de cuidado.

## 2. Estado Actual y Componentes Conectados
- **Migración de Base de Datos**: Aplicada a Supabase dev vía conexión directa puerto 5432.
  - Modelos aditivos: `OperationalTask`, `OwnerContribution`, `SupplyInventory`, `VaultAccessAudit`.
  - Campos aditivos: `Property.occupancyStatus`, `Property.careVisitIntervalDays`, `ManagementAgreement.pmExpenseLimit`.
- **Rutas y Vistas Operativas**:
  - `/cartera`: Bandeja centralizada de pendientes y alertas operativas de toda la cartera.
  - `/propiedades/[id]`: Cabecera operacional en tiempo real (ocupación, responsable, próxima llegada, decisiones pendientes, disponible fiduciario y bloqueos) y pestañas operativas (Gastos con partidas y umbrales, Llegadas con checklist de preparación, Bóveda con botón de revelado auditado, Chat con IA y conversión humana a tareas, y Acuerdo fiduciario).
  - `/portal`: Portal del propietario con transparencia fiduciaria y estados de cuenta.
- **Herramientas de Gobierno**:
  - Graft sincronizado en `tools/graft` (532 nodos, 1136 edges, 121 cards).
  - Trivy escaneado: Cero vulnerabilidades críticas o altas en código de aplicación (solo alertas de dependencias de prueba en herramientas auxiliares y tokens de Supabase locales en `.env`).
  - Suite de pruebas de aceptación: 11 de 11 tests físicos en `tests/cus09-acceptance.test.ts` pasando exitosamente.

## 3. Pruebas y Comprobación
- Compilación Turbopack: `npm run build` exitoso con 0 errores de TypeScript y 17 rutas optimizadas.
- Pruebas CUS-01: 10 de 10 aprobadas.
- Pruebas CUS-09: 11 de 11 aprobadas.

## 4. Instrucciones para Revisión en Local
1. Servidor activo en `http://localhost:3000`.
2. Revisar la bandeja central de cartera en `http://localhost:3000/cartera`.
3. Revisar el centro de mando del inmueble en `http://localhost:3000/propiedades/[id]` (ej. cualquier propiedad del listado).
4. Comprobar el revelado de secretos en Bóveda (click en 👁️ registra auditoría y muestra el código).
5. Comprobar la creación de tarea desde chat con confirmación explícita.
