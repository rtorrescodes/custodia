<!--
Sync Impact Report
- Version change: 0.0.0 -> 1.1.0
- Added sections: Core Principles, Architecture & Compliance, Development Workflow, Governance
- Modified principles:
  - Added: I. Seguridad de Nivel Militar (Enterprise/Fintech-adjacent)
  - Added: II. Multi-Tenant Desde el Día 1
  - Added: III. Arquitectura Modular y Extensible (Habilitación por Módulo)
  - Added: IV. Compatibilidad Futura (Capa de Integración Alddea/RAVSIS)
  - Added: V. Eficiencia Estricta de Tokens y Contexto
- **Version change:** 1.1.0 -> 1.2.0
- **Modified principles:**
  - Added: VI. Capa de Confianza y Datos Verificados
  - Added: VII. Identidad y Acceso Físico Unificados
  - Added: VIII. Servicios Financieros Embebidos
- **Notes:** Constitution amended to v1.2.0 to incorporate Addendum 2.
- **Version change:** 1.2.0 -> 1.3.0
- **Modified principles:**
  - Added: IX. Un Solo Asistente Conversacional (Rocío)
- **Notes:** Constitution amended to v1.3.0 to incorporate Addendum 3 (Ecosystem AI Agent).
-->

# CUSTODIA Constitution

## Core Principles

### I. Seguridad de Nivel Militar (Enterprise/Fintech-adjacent)
El sistema maneja datos financieros, legales y de acceso físico. La seguridad no es un afterthought. 
- **Row Level Security (RLS)** es obligatorio en Postgres para todas las tablas multi-tenant.
- **Cero secretos en código**: usar Secret Manager.
- **MFA obligatorio** para roles administrativos.
- Toda API externa (webhooks) debe verificar firmas HMAC.
- Datos sensibles (ej. expedientes de inquilinos, historiales de pago, fianzas) deben estar cifrados en reposo y tránsito.

### II. Multi-Tenant Desde el Día 1
Una empresa de property management = un tenant. 
- Los datos deben estar estrictamente aislados.
- El diseño debe ser agnóstico de ubicación (multi-moneda, multi-idioma, multi-jurisdicción fiscal) para operar a escala global.

### III. Arquitectura Modular y Extensible (Habilitación por Módulo)
El producto soporta, o soportará, múltiples modalidades de renta (cuidado de casas, renta a largo plazo, edificios, comercial, vacacional).
- Cada feature/dominio debe vivir en su propio módulo autocontenido.
- El sistema debe soportar habilitación de módulos de forma independiente por tenant (mediante feature flags / entitlements), sin asumir que un cliente usa todas las modalidades.
- Las tablas base (como `Property`) deben usar catálogos para tipo/modalidad, previniendo migraciones destructivas futuras.

### IV. Compatibilidad Futura (Capa de Integración Alddea/RAVSIS)
Las integraciones son clave pero no bloqueantes.
- Se debe definir una capa de "plugins de integración" con interfaces genéricas.
- Los conectores se aplican a nivel de propiedad/ubicación, siendo utilizables por cualquier modalidad de renta que ocupe el espacio físico.

### V. Eficiencia Estricta de Tokens y Contexto
- La documentación, tests, y código generado deben ser densos y directos.
- Los agentes IA deben trabajar módulo por módulo para no cargar el contexto del sistema entero.
- Se prefiere modificar puntualmente (diffs) en vez de regenerar archivos completos.

### VI. Capa de Confianza y Datos Verificados
El producto no solo gestiona operaciones, sino que genera un "historial inmutable" de la propiedad (mantenimientos, accesos, rentas). Este historial verificado es un activo de datos monetizable y diferenciador.

### VII. Identidad y Acceso Físico Unificados
La integración de CUSTODIA con ecosistemas como Alddea y RAVSIS transforma la plataforma en una llave digital universal.

### VIII. Servicios Financieros Embebidos
El sistema evolucionará para ofrecer pagos recurrentes (tokenizados), poder de compra colectivo, seguros en sitio, y factoraje (adelantos) para proveedores. La plataforma orquesta el capital sin tocar el dinero crudo ni almacenar tarjetas.

### IX. Un Solo Asistente Conversacional (Rocío)
Regla innegociable de ecosistema: Un usuario/propiedad nunca debe interactuar con dos asistentes IA compitiendo por su atención. CUSTODIA expande las habilidades del agente existente (Rocío de Alddea) inyectando su `CUSTODIASkillPack` en el runtime compartido (OpenClaw) si Alddea está activo, o instancia su propio runtime con las mismas skills si opera independiente. Toda skill ejecutada revalida estrictamente el RBAC/RLS de la plataforma.

## Architecture & Compliance

- **Stack Obligatorio**: Next.js 15, TypeScript 5 (Strict), Prisma 6, PostgreSQL 16 (Supabase), Tailwind 3.4, Google Cloud Run, Cloud Storage.
- Todos los assets subidos por usuarios deben pasar por un pipeline de optimización.
- La interfaz visual completa será delegada a **v0 (Vercel)** mediante prompts; los ingenieros de backend/agentes solo conectan la lógica.
- La facturación, reporting y nómina deben poder adaptarse por país (ej. CFDI 4.0 en México) mediante conectores regionales.

## Development Workflow

- El diseño de nuevas fases se ejecuta estrictamente usando **Spec-Kit** (`constitution` → `specify` → `plan` → `tasks` → `analyze` → `implement`).
- Cada módulo se desarrolla y prueba en aislamiento.
- Cualquier supuesta limitación o duda de negocio debe documentarse en `specs/` antes de asumirse e implementarse.

## Governance

- Esta constitución dicta las reglas arquitectónicas y de seguridad.
- Cualquier contradicción con otros documentos será resuelta dando prioridad a `NEWSYS.MD` y `SECURITY.MD`.
- Cambios mayores en la arquitectura (como la introducción de nuevos módulos de renta) requieren una enmienda a este documento para registrar la expansión del alcance.

**Version**: 1.2.0 | **Ratified**: 2026-08-17 | **Last Amended**: 2026-08-17
