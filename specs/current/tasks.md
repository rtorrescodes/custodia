# Backlog de Tareas CUSTODIA (CUS-09: Operación del Inmueble y Control de Cartera)

## Fase 1: Correcciones Mandatarias de Seguridad y Fidelidad
- [ ] T1.1: **Bóveda Zero-Trust y Auditoría de Revelado**:
  - Enmascarar `keyValue` por defecto en todas las consultas SSR y props.
  - Implementar Server Action `revealVaultSecretAction` con auditoría en `VaultAccessAudit` y comprobación estricta de facultad.
  - Probar que no se expongan secretos en HTML ni Client Components.
- [ ] T1.2: **Traducción Honesta**:
  - Refactorizar `translation.service.ts` eliminando sustituciones engañosas.
  - Si falta proveedor habilitado, retornar estado explícito `NOT_AVAILABLE` y mostrar original sin disfrazar de IA.
- [ ] T1.3: **Fideicomiso Operativo y Separación de Fondos**:
  - Eliminar equiparación entre reserva mínima y autorización de gasto.
  - Modelar saldo real, fondos comprometidos y disponibles para obligaciones.
  - Implementar `pmExpenseLimit` y flujo de solicitud/verificación de aportaciones del dueño (`OwnerContribution`).

## Fase 2: Modelado de Datos y Migración Prisma
- [ ] T2.1: Actualizar `prisma/schema.prisma` con modelos aditivos:
  - `VaultAccessAudit`
  - `OwnerContribution`
  - `OperationalTask`
  - `SupplyInventory`
  - Nuevos campos en `ManagementAgreement` (`pmExpenseLimit`, etc.) y `Property` (`occupancyStatus`, etc.).
- [ ] T2.2: Ejecutar migración y regenerar cliente Prisma.

## Fase 3: Lógica Operativa y Server Actions
- [ ] T3.1: Server Actions de Tareas y Coordinación (`operational-task.actions.ts`):
  - Crear tarea, transicionar estados, reportar bloqueos con motivo, convertir mensajes a tareas.
- [ ] T3.2: Detección de Conflictos de Estancia y Ocupación:
  - Validar colisiones entre fechas de estancias y contratos de arrendamiento en servidor.
  - Derivar estado "Lista" de cumplimiento de checklist sin bloqueos.
- [ ] T3.3: Solicitud y Verificación de Aportaciones del Propietario:
  - `requestOwnerContributionAction`, `reportOwnerContributionAction`, `verifyOwnerContributionAction`.

## Fase 4: Interfaces de Usuario (UI/UX)
- [ ] T4.1: Rediseño del Centro de Mando en `/propiedades/[id]`:
  - Cabecera operacional con indicadores reales.
  - Pestañas: Operaciones, Gastos fiduciarios, Llegadas con checklist, Bóveda con botón de revelado auditado, Tareas/Inspecciones, Bitácora cronológica con filtro de privacidad.
- [ ] T4.2: Bandeja de Atención de Cartera (`/cartera`):
  - Vista de gestión agrupada para PM con acciones directas.
- [ ] T4.3: Portal del Propietario (`/portal`):
  - Aprobación de cotizaciones en versión exacta, respuesta a solicitudes de aportación, estancias y chat en su idioma.

## Fase 5: Verificación, Pruebas y Cierre
- [ ] T5.1: Suite de pruebas automatizadas cubriendo los 15 criterios de aceptación.
- [ ] T5.2: Escaneo de seguridad Trivy y sincronización Graft.
- [ ] T5.3: Build Turbopack estricto y generación de reporte de entrega.
