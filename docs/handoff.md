# Custodia Handoff - Cierre CUS-01

## 1. Objetivo Concluido (CUS-01)
Implementar el **Núcleo SaaS Bimodal para Caseros y Property Managers** en Custodia con cierre verificable de la línea base, respetando la gobernanza de Gemstack v2.0.3, las herramientas compartidas de `C:\CODES\shared-tools` (Graft y Trivy) y sin ejecutar operaciones de costo, pagos reales ni migraciones remotas destructivas.

## 2. Estado Actual y Entregables CUS-01
- **Modelo Aditivo:**
  - `TenantMember`: Desacopla la identidad personal (`User`) de la membresía en la organización con roles canónicos (`PM_ADMIN`, `PM_STAFF`, `LANDLORD`, `OWNER`, `RENTER`, `VENDOR`) y estados (`ACTIVE`, `INVITED`, `SUSPENDED`, `REVOKED`).
  - `Portfolio` y `MemberPortfolioAccess`: Agrupación de propiedades por carteras administrativas con asignación de equipo.
  - `Property`: Jerarquía de Inmueble vs Unidad (`parentId`, `isUnit`, `unitNumber`), tipo de gestión (`OWNED` vs `THIRD_PARTY`), custodio de fondos (`LANDLORD`, `PM_ESCROW`, `DIRECT_OWNER`) y archivado no destructivo (`archivedAt`).
  - `TenantInvitation`: Invitaciones seguras con token hash SHA-256 de uso único y expiración.
- **Servicios Implementados:**
  - `src/lib/auth/membership-guard.ts`: Aislamiento estricto multi-org, revocación inmediata en servidor y control de facultades Zero Trust.
  - `src/lib/services/property-service.ts`: Conteos fidedignos (inmuebles vs unidades), creación y bloqueo de borrado destructivo ante dependencias activas.
  - `src/lib/services/lease-service.ts`: Validación de traslapes de fechas y ciclo de finalización de contratos.
  - `src/lib/services/csv-import-service.ts`: Importación por lote con validación Zod por fila, detección de duplicados y modos atómico/parcial.
  - `src/lib/services/onboarding-service.ts`: Onboarding reanudable por pasos y ciclo de vida de invitaciones.
  - `src/lib/services/experience-adapter.ts`: Lente UI bimodal (Casero vs PM) y pantalla "Hoy" accionable.
  - `src/lib/migration/cus01-backfill.ts`: Ensayo de backfill aditivo que crea membresías y carteras por defecto para datos legados sin pérdida de información.
- **Suite de Pruebas Físicas:**
  - `tests/cus01-acceptance.test.ts`: 10 escenarios canónicos ejecutados físicamente vía `npm test` con 10/10 aprobados.

## 3. Próximo Paso Recomendado
**CUS-02:** Rentas, depósitos en garantía, comisiones de administración y contabilidad confiable (Trust Accounting con distinción entre deuda, cobrado, depósito, reserva y saldo disponible para dispersión al propietario).
