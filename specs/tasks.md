# Task List: CUSTODIA Iteration 1

## Fase 1: Setup e Infraestructura Base
- [ ] Inicializar proyecto Next.js 15 (App Router).
- [ ] Configurar TypeScript estricto, ESLint y Tailwind CSS.
- [ ] Configurar Prisma ORM y conexión a Supabase (PostgreSQL).
- [ ] Implementar migraciones iniciales de base de datos basadas en `plan.md`.
- [ ] Configurar NextAuth / Supabase Auth para manejo de sesiones seguras y middleware.

## Fase 2: Modelado Multi-Tenant y Seguridad
- [ ] Configurar Row Level Security (RLS) en Supabase para aislar `tenantId` en tablas principales.
- [ ] Crear utilidades de validación de backend (Zod) para asegurar sanitización de inputs.
- [ ] Implementar wrapper de sesión para Server Actions (Zero Trust).

## Fase 3: Generación de UI con V0 (Mocks)
- [ ] Pasar el prompt de Dashboard a v0 e integrar los componentes resultantes.
- [ ] Pasar el prompt de Detalles de Propiedad a v0 e integrar los componentes.
- [ ] Pasar el prompt de Portal de Dueños a v0 e integrar los componentes.

## Fase 4: Lógica de Negocio y Módulos Core (MVP)
- [ ] **Módulo Propiedades:** Listado, alta y detalles de propiedades (Server Actions).
- [ ] **Módulo Mantenimiento:** Alta de órdenes de trabajo, asignación y cambio de estados.
- [ ] **Módulo Financiero (Ledger):** Registro de ingresos y egresos, filtrado por propiedad y moneda.

## Fase 5: Capa de Integración
- [ ] Implementar la interfaz `IExternalSystemConnector`.
- [ ] Crear el `MockConnector` de prueba.
- [ ] Integrar lógica de feature flags.

## Backlog / Fases Futuras (Diseñadas pero NO activas)
- [ ] **Fase 2:** Renta Residencial a Largo Plazo y Edificios Multi-unidad (Contratos electrónicos, Cobro recurrente tokenizado, Portal de inquilinos).
- [ ] **Fase 3:** Renta Vacacional con Channel Manager (Sincronización Beds24/Channex, Calendario).
- [ ] **Fase 4:** Renta Comercial e Industrial (Contratos multianuales, CAM charges, fianzas).
- [ ] **Fase 6:** Historial Verificado de Propiedad ("Carfax") - **[ALTA PRIORIDAD / ALTO IMPACTO]**
- [ ] **Fase 7:** Llave Digital Universal (Identidad Unificada).
- [ ] **Fase 8:** Poder de Compra Colectivo - **[ALTA PRIORIDAD / BAJO ESFUERZO]**
- [ ] **Fase 9:** Fintech Embebido para Proveedores (Factoring) - *[Dependencia Externa: Partner Financiero/Banco]*
- [ ] **Fase 10:** Seguros y Reclamaciones Integradas - *[Dependencia Externa: Aseguradora]*
- [ ] **Fase 11:** Modo Huracán / Respuesta a Emergencias.
- [ ] **Fase 12:** Cumplimiento Regulatorio de Renta Corta por Jurisdicción.
- [ ] **Fase 13:** Asistente/Conserje Conversacional del Ecosistema (Rocío - OpenClaw).
