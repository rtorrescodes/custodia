# Custodia Handoff

## 1. Objetivo
Construir **Custodia**, un SaaS PropTech B2B multi-tenant que administra rentas, mantenimientos, bóveda de accesos y trust accounting, integrado con domótica (Alddea/Ravsis) e inteligencia artificial (Zero Trust).

## 2. Estado actual
- **Qué funciona ya:** Toda la arquitectura de roles y seguridad (dueño, administrador, inquilino), la Bóveda encriptada (aislada de la IA), el portal B2B de proveedores, el Conserje Virtual nativo (Rocío) y una UI/UX Premium completamente responsiva (Zinc + Azul Cobalto). La base de datos está preparada para pagos (Stripe/MercadoPago).
- **Qué queda pendiente:** Conectar Custodia con el hardware de las propiedades (chapas y cajas fuertes de RAVSIS/Alddea) y habilitar la comunicación vía WhatsApp/Telegram con el endpoint RPC (`/api/agent`) usando OpenClaw.

## 3. Archivos y cambios
Durante la última sesión se modificó:
- `src/app/globals.css` y `src/components/app-shell.tsx`: Se implementó el rediseño "Premium" puliendo sombras, contenedores y variables.
- `src/app/propiedades/page.tsx` y `src/app/inquilino/page.tsx`: Limpieza de *Empty states* y tarjetas.
- `src/lib/data.ts` y `src/lib/services/queries.ts`: Fix en errores de tipado de fechas (forzando formato `.toISOString()`). Refactorización para ejecutar sub-consultas relacionales (`workOrders`, `transactions`) de manera secuencial dentro del bloque de `$transaction` de RLS, silenciando el warning de la librería `pg`.
- `next.config.ts`: Autorización del dominio `images.unsplash.com` para los componentes nativos de Next/Image.

## 4. Intentos fallidos
- **DeprecationWarning concurrente:** Intentar recuperar todas las relaciones en la base de datos usando `include` con arreglos masivos (ej. `workOrders`, `transactions`) dentro de una transacción `withTenantRLS()`. Esto disparó advertencias de `pg` por intentar usar la misma conexión a la vez. **Solución:** Las sub-queries a muchos (`to-many`) deben hacerse secuencialmente con `await` por separado.
- **Error Time Value:** Transportar fechas extraídas de Prisma hacia los React Client Components usando `.toLocaleDateString()`. Causa fallos en la capa de hidratación si el servidor y el navegador tienen *locales* distintos. **Solución:** Utilizar siempre `.toISOString()`.

## 5. Próximos pasos
1. Iniciar la integración de hardware y domótica física (RAVSIS / Alddea).
2. Probar la integración de mensajería (WhatsApp/Telegram) a través de OpenClaw consultando los endpoints de `api/agent`.
3. Inyectar llaves API reales de Stripe Connect cuando se tengan.
