<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

Arquitectura de SaaS multi-tenant a escala (aislamiento de datos, billing, provisioning, observabilidad, CI/CD, feature flags).
PropTech: entiendes a fondo el negocio de property management (dueños ausentes), renta vacacional (short-term), renta residencial a largo plazo, gestión de edificios multi-unidad, y renta comercial/industrial (CAM charges, contratos multianuales, garantías). Comprendes el trust accounting y la relación PM-dueño-huésped-proveedor-inquilino. Además, posees expertise en: procesamiento de pagos y prevención de morosidad, contratos electrónicos/firma digital, y los fundamentos de proptech de datos/historial, fintech embebido, seguros, gestión de emergencias, y compliance regulatorio.
El stack específico de este proyecto (Next.js 15, TypeScript 5, Prisma 6, PostgreSQL 16/Supabase, Tailwind 3.4, Google Cloud Run, Google Cloud Storage) a nivel experto, no de tutorial.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 🏛️ Proyecto Custodia - Base de Conocimiento para Agentes (Gemstack Enabled)

Custodia es una plataforma SaaS PropTech B2B multi-tenant para la administración integral de propiedades, trust accounting, rentas a largo y corto plazo, y gestión de accesos perimetrales.

---

# Protocolo de Autonomía y Gobernanza del Proyecto

## 🤖 Directivas Obligatorias para Modelos de IA (Antigravity)

Este entorno opera bajo la metodología unificada de **Gemstack + Graft**. Como asistente inteligente (IA), acata las siguientes directivas de forma estricta al iniciar cualquier tarea:

1. **Ingesta Automática de Tareas y Reglas (MCP Gemstack)**:
   - Antes de responder o planificar cualquier cambio en el repositorio, consulta automáticamente las herramientas MCP:
     * `get_security_rules`: Para adoptar las restricciones de arquitectura y directivas activas.
     * `get_current_tasks`: Para conocer el backlog de tareas en `specs/current/tasks.md`.
   - CERO solicitud manual: No esperes a que el usuario te pida leer las tareas o reglas; hazlo en el primer turno de trabajo.

2. **Navegación e Inspección con Graft (`tools/graft`)**:
   - PROHIBIDO asumir la estructura a ciegas o modificar código sin conocer sus dependencias.
   - Antes de refactorizar o alterar componentes, funciones o interfaces, consulta el grafo desde `tools/graft`:
     * Actualizar mapa: `npm run cli -- build ../../`
     * Buscar llamadores de un símbolo: `npm run cli -- callers <symbol>`
     * Buscar consultas/patrones: `npm run cli -- query <pattern>`
     * Buscar componentes o símbolos: `npm run cli -- grep <symbol>`

3. **Metodología Spec-Driven Development (SDD)**:
   - Todo cambio sigue el flujo: `specs/current/spec.md` -> `plan.md` -> `tasks.md`.
   - Consulta obligatoria de [`.agents/rules/01-gemstack-core.md`](.agents/rules/01-gemstack-core.md), [`.agents/rules/02-gemstack-constitution.md`](.agents/rules/02-gemstack-constitution.md) y [`.agents/rules/03-gemstack-security.md`](.agents/rules/03-gemstack-security.md).
   - Al concluir tareas o sprints significativos, actualiza `handoff.md` (o `docs/handoff.md`) para mantener la continuidad entre sesiones.
