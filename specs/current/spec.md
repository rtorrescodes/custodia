# Especificación Funcional: CUS-09 — Operación Completa del Inmueble y Control de Cartera

## 1. Contexto y Problema
Custodia administra tres tipologías operativas clave sobre un mismo núcleo:
1. **Vivienda con Arrendamiento Residencial**: Contrato activo, inquilino, pagos de renta, depósitos en garantía, inspecciones de entrada/salida y solicitudes de servicio.
2. **Cuidado de Casa de Propietario (Absentee Owner)**: Propietario que reside fuera, visitas de inspección periódica, custodia de accesos en bóveda, checklist de llegada para estancias personales o de invitados, fondo de reserva y chat bilingüe asistido con IA.
3. **Propiedad Desocupada en Conservación**: Inmueble vacante, inspecciones recurrentes de prevención (fugas, plagas, clima), activos inventariados y preparación para el siguiente ocupante.

### Hallazgos de la auditoría sobre la entrega previa:
- **A1. Falso umbral de gasto automático**: Se equiparaba `ManagementAgreement.reserveMinimum` con autorización automática de gasto. Un gasto menor que la reserva puede carecer de fondos disponibles o exceder las facultades del PM.
- **A2. Traducción superficial**: Se reemplazaban palabras clave con un diccionario hardcodeado haciéndolas pasar por "IA". Si no hay API key configurada, debe indicarse con honestidad que la traducción no está disponible y mostrar el texto original con metadata estricta.
- **A3. Secretos de Bóveda expuestos**: La bóveda devolvía secretos descifrados en el payload SSR/cliente. Debe enmascararse (`••••••••`) y requerir una Server Action protegida con auditoría de revelado.

---

## 2. Requerimientos Funcionales

### R1. Fideicomiso Operativo, Fondos y Autorización de Gastos
- **Separación de conceptos financieros**:
  - Saldo en cuenta del propietario vs. Reserva mínima contractual obligatoria.
  - Fondos comprometidos (órdenes aprobadas pendientes de pago) vs. Fondos disponibles para nuevas obligaciones.
  - Facultad máxima del PM para gastos sin consulta previa (`pmExpenseLimit`) con categorías permitidas.
- **Flujo de Gasto**:
  1. `WorkOrder` con partidas detalladas en `WorkOrderQuote`.
  2. Evaluación: ¿Excede la facultad del PM? $\rightarrow$ Requiere autorización explícita del propietario en versión exacta y moneda.
  3. Verificación de fondos: Si está autorizada pero no hay saldo disponible $\rightarrow$ Estado `BLOCKED_INSUFFICIENT_FUNDS`.
  4. Solicitud de aportación al propietario: Monto, moneda, motivo y fecha límite.
  5. Reporte de aportación por el propietario $\rightarrow$ Verificación administrativa por el PM antes de liberar fondos en el ledger.
  6. Finalización del trabajo $\rightarrow$ Verificación técnica realizada $\neq$ Pago ejecutado al proveedor.

### R2. Traducción Honesta y Bilingüe (ES / EN)
- El envío de mensajes es desacoplado del servicio de traducción.
- Si no hay proveedor real habilitado (DeepSeek sin clave), se preserva el texto original y el estado `NOT_TRANSLATED` ("Traducción no disponible").
- El diccionario global de interfaz cubre navegación, estados, errores, botones y reportes de forma independiente de los mensajes.

### R3. Bóveda Digital con Zero Trust y Auditoría de Revelado
- Las consultas habituales solo devuelven el tipo, nombre de clave, estado y valor enmascarado (`••••••••`).
- Nueva acción `revealVaultSecret`:
  - Valida sesión SSR (`getUser()`), membresía activa en el tenant, rol y relación con la propiedad.
  - Registra evento en `VaultAccessLog` (quién, cuándo, qué clave, IP/UserAgent) SIN guardar el secreto en el log.
  - Devuelve el valor en claro únicamente en la respuesta directa de la acción.

### R4. Centro de Mando del Inmueble (Property Operations Hub)
- Cabecera operacional: Ocupación/Uso actual, Responsable asignado, Próxima llegada/salida, Decisiones pendientes del dueño, Fondos disponibles y Bloqueos críticos.
- Bitácora cronológica unificada del inmueble con filtrado de privacidad por audiencia (pública vs. interna del PM).

### R5. Núcleo de Tareas Operativas, Checklists y Visitas de Cuidado
- Máquina de estados: `PENDING` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `BLOCKED` $\rightarrow$ `VERIFICATION_PENDING` $\rightarrow$ `COMPLETED` / `CANCELLED`.
- Tareas bloqueadas exigen motivo explícito.
- Creación de tarea a partir de un mensaje de chat mediante acción humana confirmada.
- Visitas de cuidado de propiedades vacantes con checklists preventivos y conversión de hallazgos en órdenes de trabajo.

### R6. Estancias, Llegadas y Detección de Conflictos
- Detección en servidor de colisiones entre fechas de estancias personales y contratos de arrendamiento activos.
- Si hay inquilino vigente, la estancia se bloquea a menos que exista flujo explícito de visita consentida.
- El estado "Lista para llegada" se deriva del cumplimiento y verificación de todos los ítems obligatorios del checklist.

### R7. Bandeja de Atención de Cartera (Portfolio Operations Inbox)
- Vista consolidada de pendientes en `/cartera`: tareas vencidas, decisiones del propietario requeridas, fondos insuficientes, llegadas bloqueadas y propiedades sin inspección reciente.
- Expediente de entrega de administración (Handover Dossier) al revocar o transferir gestión.
