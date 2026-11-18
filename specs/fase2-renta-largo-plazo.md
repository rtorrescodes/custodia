# Fase 2: Renta Residencial a Largo Plazo y Edificios Multi-unidad

## Relación con la Constitución
Esta especificación se adhiere a la Constitución v1.1.0, específicamente al Principio III (Arquitectura Modular y Extensible), operando como un módulo independiente activable por tenant. Se respeta el modelo multi-tenant y se asume aislamiento estricto de datos.

## Alcance y Funcionalidad
El módulo amplía el core para soportar:
- **Contratos de Arrendamiento:** Plantillas configurables por jurisdicción. Registro y gestión de depósitos en garantía. Alertas de vencimiento y flujos de renovación.
- **Cobranza:** Cobro de renta recurrente automatizado (notificaciones, pagos online, recargos por mora).
- **Gestión de Inquilinos:** Expedientes completos, historial de pagos, referencias.
- **Portal de Inquilino:** Nueva interfaz para arrendatarios (rol Inquilino) para pagar, reportar incidencias y ver contratos.
- **Jerarquía Multi-unidad:** Concepto de Edificio con `n` Unidades subyacentes. Dashboard de ocupación consolidado.
- **Finanzas:** Gastos comunes (CAM) prorrateados, reportes por edificio y unidad.

## Requisitos de Arquitectura
- El estado de la `Property` ahora puede derivar de sus sub-unidades (ej. ocupada/vacante/mantenimiento).
- Este módulo requiere habilitarse mediante feature flag/entitlement en la cuenta del tenant.
- Se introduce el rol `Inquilino` en el RBAC, que requerirá estrictas políticas RLS para acceder únicamente a sus propios contratos y ledger de pagos.

## Extensión: Pagos, Contratos y Documentación Legal (Addendum 2)
Esta fase incluye explícitamente:
- **Prevención de Morosidad:** Cobro automático recurrente, tokenización de tarjetas vía Stripe/Mercado Pago. Reintentos automáticos y notificaciones proactivas de vencimiento. CUSTODIA NUNCA almacena datos crudos de tarjeta (PCI-DSS delegado al proveedor).
- **Contratos Inteligentes:** Contratos de arrendamiento generados en línea con firma electrónica.
- **Gestión de Cláusulas:** Bloques de cláusulas versionables y reutilizables (depósito, mascotas, subarrendamiento), permitiendo actualizaciones en bloque.
- **Repositorio Documental Seguro:** Identificaciones, comprobantes de ingresos, avales y fianzas. Todo almacenado con cifrado en reposo equivalente a los datos financieros de la Fase 1. Inventarios de entrada/salida apoyados en el sistema de evidencias fotográficas existente.

## Consideraciones de Seguridad
Los expedientes de inquilinos, contratos firmados y garantías introducen una carga mayor de PII e historial crediticio. Deben almacenarse de manera cifrada en reposo. Los pagos exigen bóveda de tokens (Vaulting) sin contacto con la PAN de la tarjeta.
