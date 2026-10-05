# Plan Técnico: CUS-09 — Operación Completa del Inmueble y Control de Cartera

## 1. Arquitectura y Modelo de Datos (Migración Prisma Aditiva)

### Modelos y Campos Nuevos:
1. **PropertyVault**:
   - Agregar campo `isRotated Boolean @default(false)` y `lastRotatedAt DateTime?`.
   - Crear modelo `VaultAccessAudit`: `id`, `tenantId`, `vaultId`, `userId`, `action` ("REVEAL" | "ROTATE"), `ipAddress`, `createdAt`.
2. **ManagementAgreement**:
   - Agregar `pmExpenseLimit Decimal @default(1000)`: Límite de gasto autónomo del PM. Gastos superiores exigen aprobación del dueño.
   - Agregar `autoApproveCategories String[]`: Categorías exentas de consulta (ej. emergencias, plomería urgente).
3. **Property (Campos Operativos)**:
   - `occupancyStatus`: enum `VACANT`, `OWNER_OCCUPIED`, `RENTED`, `UNDER_MAINTENANCE`.
   - `primaryManagerId`: String? (referencia a User para el PM responsable).
4. **OwnerContribution**:
   - Modelo para aportaciones del dueño: `id`, `tenantId`, `propertyId`, `ownerId`, `amount`, `currency`, `reason`, `requestedAt`, `reportedAt`, `verifiedAt`, `verifiedById`, `evidenceUrl`, `status` ("REQUESTED" | "REPORTED" | "VERIFIED" | "CANCELLED").
5. **OperationalTask**:
   - Modelo unificado de tareas: `id`, `tenantId`, `propertyId`, `title`, `description`, `assigneeId`, `dueDate`, `priority`, `status` (`PENDING`, `ASSIGNED`, `IN_PROGRESS`, `BLOCKED`, `VERIFICATION_PENDING`, `COMPLETED`, `CANCELLED`), `blockedReason`, `checklistJson`, `sourceType` ("CHAT", "INSPECTION", "RECURRENT", "MANUAL"), `sourceId`, `createdAt`.
6. **SupplyInventory**:
   - Inventario básico de suministros (limpieza, focos, filtros): `id`, `tenantId`, `propertyId`, `item`, `currentStock`, `minimumStock`, `unit`.

---

## 2. Refactorizaciones Críticas de Código

### A1. Corrección de Fondos y Gastos (`property-operations.actions.ts`)
- Eliminar la lógica `cost > reserveMinimum` como autorización automática.
- Implementar cálculo real fiduciario:
  - `ownerBalance` (ingresos cobrados - gastos pagados).
  - `committedFunds` (cotizaciones aprobadas pendientes de pago).
  - `availableFunds` = $\max(0, \text{ownerBalance} - \text{reserveMinimum} - \text{committedFunds})$.
- La acción evalúa:
  - Si `cost > pmExpenseLimit` $\rightarrow$ Requiere aprobación explícita del dueño (`AWAITING_OWNER_APPROVAL`).
  - Si está autorizada pero `cost > availableFunds` $\rightarrow$ Marca `BLOCKED_INSUFFICIENT_FUNDS` y permite generar `OwnerContributionRequest`.
  - Finalización de orden marca `COMPLETED` con verificación técnica, pero el pago se registra en acción separada `recordVendorPayment`.

### A2. Traducción Honesta (`translation.service.ts`)
- Eliminar el mock que inyectaba prefijos o diccionarios parciales simulando "IA".
- Si no hay `DEEPSEEK_API_KEY` o vale "mock-key", devolver:
  `{ translated: text, sourceLang, isAiGenerated: false, status: "NOT_AVAILABLE" }`.
- Preservar estado en el hilo y desacoplar de la persistencia del mensaje.

### A3. Bóveda Zero-Trust y Auditoría (`vault.actions.ts` y queries)
- `getPropertyData`: Bóveda devuelve `keyValue: "••••••••"`.
- Server Action `revealVaultSecret({ vaultId })`:
  - Verifica sesión vía `getUser()`.
  - Verifica membresía activa en `TenantMember` y que el usuario sea PM o Propietario con contrato vigente.
  - Inserta registro en `VaultAccessAudit` con timestamp y `userId`.
  - Descifra y devuelve el secreto únicamente al solicitante.

### B. Centro de Operación del Inmueble (`/propiedades/[id]`)
- Cabecera operacional con indicadores reales: ocupación, responsable, próxima llegada, decisiones pendientes, fondos disponibles y bloqueos.
- Sub-pestañas: Operaciones, Gastos & Aprobaciones, Llegadas & Estancias, Bóveda, Tareas & Inspecciones, Bitácora Cronológica.

### C. Bandeja de Cartera (`/cartera`)
- Vista consolidada de pendientes agrupados:
  - Llegadas bloqueadas.
  - Tareas vencidas.
  - Decisiones pendientes de propietarios.
  - Órdenes bloqueadas por falta de fondos.
  - Inmuebles sin inspección en más de 30 días.
