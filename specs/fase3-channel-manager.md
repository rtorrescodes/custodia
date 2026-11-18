# Fase 3: Renta Vacacional (Short-Term) con Channel Manager

## Relación con la Constitución
Esta especificación aplica el Principio III (Módulos independientes) y el Principio IV (Compatibilidad de Integraciones) de la Constitución v1.1.0. Se concibe como una extensión que no interfiere con el cuidado puro de la propiedad, sino que lo complementa con sincronización comercial.

## Alcance y Funcionalidad
Este módulo activa las capacidades comerciales de renta a corto plazo:
- **Integración con Agregadores:** Sincronización mediante agregador certificado (Beds24, Channex, Rentals United) para conectar con Airbnb, Booking, Vrbo. (Evita el partnership directo inicial).
- **Calendario Unificado:** Sincronización bidireccional, protección anti-overbooking. (Soporte iCal como fallback básico gratuito).
- **Gestión Comercial:** Sincronización de precios, disponibilidad. Reportes de rentabilidad por canal.
- **Comunicación:** Bandeja unificada con huéspedes de múltiples canales.
- **Turnover:** Checklist automatizado y limpieza disparada tras el check-out (se enlaza al módulo de Órdenes de Trabajo de la Fase 1).

## Requisitos de Arquitectura
- Requerirá infraestructura de webhooks de alto volumen para manejar sincronizaciones de calendario en tiempo real.
- Las tablas financieras de la Fase 1 (`Ledger`) deben soportar desgloses de ingresos generados por canal y deducción de comisiones del agregador.
- Habilitación modular estricta: un property manager puede usar Custodia para 10 casas en renta vacacional y 5 solo bajo cuidado de dueño ausente.

## Consideraciones de Seguridad
Verificación estricta de webhooks entrantes (HMAC) provenientes del Channel Manager. Rate limiting en sincronizaciones de calendario.
