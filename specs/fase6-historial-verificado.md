# Fase 6: Historial Verificado de Propiedad ("Carfax de la Casa")

## Relación con la Constitución
Aplica el Principio VI (Capa de Confianza y Datos Verificados).

## Alcance y Funcionalidad
El sistema compilará un historial inmutable de todo lo que le ocurre a la propiedad, combinando:
- **Mantenimiento:** Órdenes de trabajo, facturas, fotos de antes y después (Dependencia: Fase 1 - Mantenimiento).
- **Incidentes:** Eventos registrados (Dependencia: Capa de Conectores Alddea/RAVSIS).
- **Ocupación:** Histórico de rentas, inquilinos verificados (Dependencia: Fase 2 y 3).

El objetivo es generar un reporte auditable ("Carfax") que incremente el valor de reventa del inmueble o baje sus primas de seguro.

## Prioridad y Dependencias
**Prioridad Relativa:** ALTA (Mayor relación esfuerzo/impacto).
Esta fase es "casi gratis" de construir porque reutiliza los datos que las otras fases ya generan. Simplemente requiere una capa de agregación, visualización (PDF/Dashboard) y posible certificación criptográfica (hashes).
