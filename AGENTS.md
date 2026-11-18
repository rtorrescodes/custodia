<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

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
