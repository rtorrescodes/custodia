# Fase 4: Renta Comercial e Industrial

## Relación con la Constitución
Alineado con el Principio III de la Constitución v1.1.0, este módulo se habilita para property managers corporativos, extendiendo la jerarquía de propiedades a especificaciones industriales sin romper el esquema residencial.

## Alcance y Funcionalidad
El módulo atiende las particularidades de oficinas, bodegas y locales:
- **Contratos Complejos:** Soporte para contratos multianuales con cláusulas de incremento indexadas (inflación/moneda).
- **Garantías Corporativas:** Gestión de fianzas comerciales, avales y cartas de crédito.
- **Finanzas Comerciales:** CAM charges avanzados (mantenimiento de áreas comunes), facturación prorrateada de servicios (luz, agua).
- **Especificaciones de Inmueble:** Atributos expandidos (m², andenes de carga, capacidad eléctrica, altura libre).
- **Subarrendamiento y Mejoras:** Tracking de "Tenant Improvements" y subarrendamientos formales.

## Requisitos de Arquitectura
- Los atributos de las propiedades (`Property`) deben ser flexibles (idealmente un esquema JSON o relación 1:1 polimórfica) para evitar contaminar propiedades residenciales con columnas industriales nulas.
- Las integraciones de Facturación (CFDI u otros) de la Fase 1 requerirán soporte para adendas comerciales específicas.

## Consideraciones de Seguridad
Los contratos corporativos suelen tener NDAs o cláusulas confidenciales de montos y comisiones. El acceso a los documentos de estos Tenants debe estar estrictamente limitado por RBAC al `Admin` de la empresa o roles financieros explícitamente autorizados.
