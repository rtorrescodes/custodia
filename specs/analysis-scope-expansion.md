# Análisis de Impacto y Extensibilidad (Scope Expansion)
**Fecha:** 2026-08-17
**Propósito:** Analizar la factibilidad de incorporar las Fases 2 (Largo Plazo), 3 (Renta Vacacional) y 4 (Industrial/Comercial) sobre la Fase 1 (Cuidado de Dueño Ausente), evaluando impactos en `Property` y `Integraciones`.

## 1. Análisis del Modelo `Property`
Actualmente en `schema.prisma`:
```prisma
model Property {
  id               String   @id @default(uuid())
  tenantId         String
  name             String
  address          String
  fraccionamiento  String?
  alddeaId         String?
  ravsisId         String?
  ...
}
```

**Evaluación de Extensibilidad:**
- **Fase 2 (Edificios y Unidades):** Requerirá una jerarquía. Para no romper la tabla, se puede agregar un campo `parentId String? @relation(...)` a `Property` para denotar que una propiedad es "hija" (Unidad) de otra (Edificio), en lugar de crear una tabla nueva `Unit`. Esto es compatible y retrocompatible.
- **Fase 4 (Comercial/Industrial - Atributos extendidos):** La tabla actual tiene campos fijos residenciales. Agregar decenas de campos nulos industriales romperá el principio de diseño limpio. 
  - **Recomendación/Alerta:** Se requerirá agregar un modelo `PropertyDetails` o un campo `Json` de `attributes` a la tabla `Property`. Esto no rompe la Fase 1 si se añade de forma opcional.
- **Múltiples Modalidades:** No existe actualmente un campo que defina "Para qué se usa esta propiedad" (ej. Vacacional, Comercial). Habrá que agregar `usageType` o `propertyType` como enum/catálogo.

## 2. Análisis de la Capa de Integraciones
Actualmente:
```prisma
model TenantIntegration {
  tenantId         String
  provider         String   // ALDDEA, RAVSIS, STRIPE
  isActive         Boolean
  config           Json
}
```

**Evaluación de Extensibilidad:**
- Las integraciones actuales están mapeadas por `Tenant`. Sin embargo, el addendum requiere que Alddea/RAVSIS operen a nivel de *ubicación/propiedad*.
- **Alerta de Cambio Requerido (Breaking/Refactor):** En el modelo actual, `Property` asocia `alddeaId` y `ravsisId` directamente como columnas, mientras que la configuración va por `TenantIntegration`. Esto funciona para la Fase 1, pero si en las fases futuras un tenant tiene propiedades en muchos fraccionamientos, el esquema de `TenantIntegration` deberá refinarse a un modelo polimórfico o un `PropertyIntegration` si cada propiedad requiere configuraciones distintas de conectores.
- Para la Fase 3 (Channel Manager), se podrá agregar un provider `BEDS24` a la tabla `TenantIntegration` sin problemas.

## Conclusión del Análisis
La expansión de alcance es **90% compatible** con lo construido en la Fase 1. 
- **No es necesario refactorizar la Fase 1 ahora mismo.**
- Cuando se inicie la Fase 2/4, se requerirá alterar la tabla `Property` añadiendo jerarquía (`parentId`) y un campo JSON o modelo adjunto para metadatos flexibles. Esto se puede hacer sin romper el MVP.
