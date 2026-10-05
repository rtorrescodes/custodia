# Project Constitution: CUSTODIA (Working Title)

## 1. Misión
Construir una plataforma SaaS global, modular y multi-tenant de administración de propiedades. El objetivo es ofrecer un producto agnóstico de ubicación, seguro y robusto para administradores de propiedades, que pueda operar de manera independiente o interconectado con otros productos del ecosistema (Alddea y RAVSIS).

## 2. Principios de Ingeniería

### 2.1. Seguridad de Nivel Militar (Cybersecurity)
Este sistema maneja datos financieros, documentos legales y controla accesos físicos.
- **Zero Trust en el Frontend:** Nunca confiar en `tenantId`, `userId` o roles enviados en payloads del cliente. Extraer la identidad siempre en el backend usando la sesión real.
- **Aislamiento Multi-tenant estricto:** Row Level Security (RLS) activo en PostgreSQL para aislar los datos. Cada consulta Prisma debe filtrar explícitamente por `tenantId`.
- **Validación Estricta:** Uso obligatorio de validaciones con Zod en todas las Server Actions o API Endpoints antes de tocar la base de datos o lógica de negocio. Sin tipos `any`.
- **Protección de Datos Sensibles:** MFA obligatorio para administradores, cifrado en reposo para documentos legales, cero secretos en código, protección contra inyección SQL y XSS. (Referencia: `SECURITY.MD`).

### 2.2. Arquitectura Modular y Dominio
- El código se estructura por dominios de negocio (Propiedades, Dueños, Finanzas, etc.), no por tipo de archivo. Cada módulo es autocontenido (componentes, hooks, actions, types).
- **Evitar archivos monolíticos:** Vistas mayores a 1000 líneas están estrictamente prohibidas para asegurar mantenibilidad y eficiencia de contexto.

### 2.3. Eficiencia de Tokens y Contexto (IA)
- Los agentes IA trabajarán un módulo a la vez. No deben mantener contexto innecesario.
- Los logs y errores durante desarrollo deben leerse localmente (interceptores en consola) para no saturar contextos.
- Diffs y ediciones puntuales se prefieren sobre la regeneración completa de archivos masivos.

### 2.4. Multi-Tenant y Agnosticismo Geográfico desde el Día 1
- **Internacionalización:** Diseño multi-idioma (UI y notificaciones) y multi-moneda de forma nativa.
- **Localización fiscal modular:** La facturación (ej. CFDI 4.0 para México) y regulaciones se tratan como plugins intercambiables según el tenant, no como lógica dura.

### 2.5. Compatibilidad Futura e Independencia (Ecosistema)
- CUSTODIA debe funcionar 100% de manera independiente y poder ser comercializado por separado.
- Las integraciones con Alddea y RAVSIS se diseñan mediante una capa de conectores abstracta (interfaces estándar) que permite activar/desactivar características de integración con feature flags sin afectar el núcleo de la aplicación.

### 2.6. Retrocompatibilidad (Backward Compatibility)
- Jamás asumir bases de datos vacías. Siempre asegurar que las alteraciones al esquema y la lógica mantengan accesibles y funcionales los datos existentes. (Referencia: `NEWSYS.MD`).
