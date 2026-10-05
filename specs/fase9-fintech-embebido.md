# Fase 9: Fintech Embebido para Proveedores (Factoring)

## Relación con la Constitución
Aplica el Principio VIII (Servicios Financieros Embebidos).

## Alcance y Funcionalidad
Dado el flujo de capital (trust accounting) ya manejado:
- Opción de "Adelanto de Pago" para contratistas que acaban de terminar una Orden de Trabajo (Fase 1) antes de que el dueño libere los fondos a los 30 días, cobrando un fee.
- Se orquesta con fondos propios o de un socio financiero.

## Dependencias y Complejidad
**Complejidad:** MUY ALTA (Requiere Partner Financiero / Banco).
Esta fase no debe construirse en aislamiento. Depende del Directorio de Proveedores de la Fase 1 y de la arquitectura de Ledger y Pagos de la Fase 2.

## Seguridad
Introduce datos financieros sensibles de terceros (cuentas bancarias de proveedores para dispersión). Debe tratarse bajo estándares militares de cifrado de PII y PCI-DSS en tránsito.
