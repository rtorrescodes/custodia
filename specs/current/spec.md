# Especificación Maestra CUSTODIA (SDD): CUS-00 a CUS-08

## 1. Visión y Propósito
Custodia es una plataforma SaaS PropTech B2B multi-tenant con **dos experiencias de usuario y un núcleo común**:
1. **Casero / Propietario Directo:** Navegación sencilla para rentar y controlar sus propiedades propias sin intermediarios.
2. **Property Manager (PM) Profesional / Empresa:** Gestión de múltiples carteras, comisiones sobre renta, liquidaciones a propietarios, cuadrillas de proveedores y trust accounting riguroso.

Integración nativa con **Alddea (HOA & Control de Acceso)** como engrane multiplicador perimetral.

## 2. Mapa de Paquetes de Entrega
- **[x] CUS-00: Auditoría de Repositorio, Gobierno y Herramientas.**
- **[ ] CUS-01: Núcleo SaaS:** Organizaciones, carteras, unidades, roles y onboarding bimodal (Casero vs PM).
- **[ ] CUS-02: Rentas, Depósitos, Comisiones y Contabilidad Confiable:** Flujo *obligación → cobro → conciliación → recibo → reporte*.
- **[ ] CUS-03: Pasarelas y Cobranza:** Stripe Connect, transferencias, conciliación bancaria y recibos automatizados.
- **[ ] CUS-04: Contratos en Línea:** Firma digital, renovaciones, penalizaciones e inspecciones de entrega/recepción.
- **[ ] CUS-05: Mantenimiento y Accesos Físicos:** Reportes, presupuestos, aprobación de gastos y control de acceso vía Alddea.
- **[ ] CUS-06: Portales y Conserje IA:** Portal Inquilino, Portal Propietario, Conserje IA (OpenClaw/Rocío con skills federadas de Alddea).
- **[ ] CUS-07: Cierre Mensual y Reportes Financieros:** Desglose fiduciario (deuda, dinero cobrado, depósito, reserva, disponible para el dueño).
- **[ ] CUS-08: Planes SaaS, Facturación y Piloto Comercial:** Monetización por puerta/unidad y activación de clientes piloto.

## 3. Criterios de Aceptación para CUS-00
- [x] Repositorio inspeccionado exhaustivamente (esquema, rutas, dependencias, estado git).
- [x] Gobernanza Gemstack v2.0.3 verificada con `npx gemstack-ai doctor`.
- [x] Herramientas compartidas en `C:\CODES\shared-tools` (Graft y Trivy) verificadas y operativas.
- [x] Escaneo de seguridad Trivy ejecutado y persistido en `.gemstack/security-report.json`.
- [x] Mapa de contexto Graft generado (66 archivos, 256 nodos, 595 aristas).
- [x] Emisión formal del bloque `REPORTE PARA DIRECCIÓN CUSTODIA`.
