# Backlog de Tareas CUSTODIA (CUS-09, CUS-09B, CUS-09C: Operación del Inmueble y Control de Cartera)

## Fase 1: Correcciones Mandatarias de Seguridad y Fidelidad
- [x] T1.1: **Bóveda Zero-Trust y Auditoría de Revelado**:
  - Enmascarar `keyValue` por defecto en todas las consultas SSR y props.
  - Implementar Server Action `revealVaultSecretAction` con auditoría en `VaultAccessAudit` y comprobación estricta de facultad.
  - Probar que no se expongan secretos en HTML ni Client Components. *(Evidencia: tests/cus09-acceptance.test.ts TC-10)*
- [x] T1.2: **Traducción Honesta y Deduplicación Persistente**:
  - Refactorizar `translation.service.ts` eliminando sustituciones engañosas.
  - Persistencia multinivel con `TranslationRecord` en PostgreSQL (Supabase) con SHA256 (`sourceHash`).
  - Si falta proveedor habilitado, retornar estado explícito `NOT_AVAILABLE` y mostrar original sin disfrazar de IA. *(Evidencia: tests/cus09c-acceptance.test.ts R6)*
- [x] T1.3: **Fideicomiso Operativo y Separación de Fondos**:
  - Eliminar equiparación entre reserva mínima y autorización de gasto.
  - Modelar saldo real, fondos comprometidos y disponibles para obligaciones sin ocultar déficit (`Math.max`).
  - Implementar `pmExpenseLimit` (null = no configurado / requiere aprobación) y flujo de solicitud/verificación de aportaciones del dueño (`OwnerContribution`). *(Evidencia: tests/cus09b-acceptance.test.ts TC-01, TC-02, TC-03)*

## Fase 2: Modelado de Datos y Migración Prisma
- [x] T2.1: Actualizar `prisma/schema.prisma` con modelos aditivos:
  - `VaultAccessAudit`
  - `OwnerContribution`
  - `OperationalTask`
  - `SupplyInventory` y `SupplyMovement`
  - `TranslationRecord`
  - Nuevos campos en `ManagementAgreement` (`pmExpenseLimit`, `emergencyRule`, `autoApproveCategories`, etc.) y `Property` (`occupancyStatus`, `lastCareVisitAt`, `careVisitIntervalDays`).
- [x] T2.2: Sincronización en base Supabase de desarrollo (`npx prisma db push`) y regeneración de cliente Prisma (`npx prisma generate`).

## Fase 3: Lógica Operativa y Server Actions
- [x] T3.1: Server Actions de Tareas y Coordinación (`operational-task.actions.ts`):
  - Crear tarea, transicionar estados, reportar bloqueos con motivo obligatorio (`BLOCKED`), convertir mensajes a tareas.
  - CUS-09C: Asignación a personal/staff, solicitud de verificación por operario con evidencias (`VERIFICATION_PENDING`), resolución por PM (`COMPLETED` o devolución con notas a `IN_PROGRESS`). *(Evidencia: tests/cus09c-acceptance.test.ts R3)*
- [x] T3.2: Detección de Conflictos de Estancia y Ocupación (`property-operations.actions.ts`):
  - Validar colisiones entre fechas de estancias y contratos de arrendamiento en servidor.
  - Derivar estado "Lista" de cumplimiento de checklist sin bloqueos.
  - CUS-09C: Cancelación de estancias, simulación de puente de pase Alddea, y actualización de `lastCareVisitAt` ÚNICAMENTE al completarse la visita preventiva. *(Evidencia: tests/cus09c-acceptance.test.ts R4)*
- [x] T3.3: Aprobación y Financiamiento Desacoplados:
  - `approveQuoteAction`: Dueño aprueba cotización formalmente aun sin fondos; el sistema marca `"Aprobada, pendiente de fondos"` y deriva solicitud de aportación sin bloquear la decisión. *(Evidencia: tests/cus09c-acceptance.test.ts R1)*
  - `recordVendorPaymentAction`: Pagos parciales y finiquitos consumen el compromiso de la orden sin doble deducción de saldo disponible ni rechazos ilegítimos. *(Evidencia: tests/cus09c-acceptance.test.ts R2)*
- [x] T3.4: Ciclo de Contrato y Obligaciones Recurrentes (`lease.actions.ts`):
  - Renovación versionada de contrato (`renewLeaseAction`).
  - Salida (move-out) con inspección y liquidación humana de depósito en garantía (`processMoveOutWithDepositReviewAction`).
  - Tareas recurrentes periódicas idempotentes (`executeRecurringObligationAction`). *(Evidencia: tests/cus09c-acceptance.test.ts R5)*
- [x] T3.5: Informe Operativo de Valor y Entrega de Administración (`property.actions.ts`):
  - `generateOwnerPerformanceReportAction`: Resumen ejecutivo operativo bilingüe diferenciado del estado de cuenta. *(Evidencia: tests/cus09c-acceptance.test.ts R6)*
  - `executePropertyHandoffAction`: Reasignación de tareas, rotación obligatoria de credenciales y acta formal de entrega. *(Evidencia: tests/cus09c-acceptance.test.ts R7)*

## Fase 4: Interfaces de Usuario (UI/UX)
- [x] T4.1: Rediseño del Centro de Mando en `/propiedades/[id]`:
  - Cabecera operacional con indicadores reales fiduciarios y de ocupación.
  - Pestañas: Operaciones, Gastos fiduciarios, Llegadas con checklist, Bóveda con botón de revelado auditado, Tareas/Inspecciones, Bitácora cronológica con filtro de privacidad.
- [x] T4.2: Bandeja de Atención de Cartera (`/cartera`):
  - Vista de gestión agrupada para PM con acciones directas y alertas fiduciarias.
- [x] T4.3: Portal del Propietario (`/portal`):
  - Aprobación de cotizaciones en versión exacta, visualización de estado "Aprobada, pendiente de fondos", respuesta a aportaciones, estancias y chat bilingüe.

## Fase 5: Verificación, Pruebas y Cierre
- [x] T5.1: Suite de pruebas físicas automatizadas:
  - `tests/cus09-acceptance.test.ts` (11/11 pasadas)
  - `tests/cus09b-acceptance.test.ts` (6/6 pasadas)
  - `tests/cus09c-acceptance.test.ts` (7/7 pasadas)
- [x] T5.2: Verificación de compilación estricta (`npm run build`) en Next.js Turbopack sin errores.
- [x] T5.3: Documentación de entrega y handoff.md actualizado.
