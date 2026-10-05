# Fase 13: Asistente Conversacional del Ecosistema (Rocío)

## Relación con la Constitución
Aplica el Principio IX (Un Solo Asistente Conversacional) y el Principio IV (Capa de Integración).

## Arquitectura Recomendada
Uso del framework **OpenClaw** (runtime de agentes open-source, model-agnostic).
- **CUSTODIASkillPack**: Un paquete de skills encapsuladas que fungen como una capa muy delgada sobre los *Server Actions* de Next.js. Toda la lógica de negocio y validación de permisos (RBAC) vive en el backend, no en el LLM.

## Comportamiento por Ecosistema
El conector de integración de la Fase 5.7 debe detectar si la propiedad cuenta con una instancia activa de Alddea+Rocío.
- **Si existe Alddea**: CUSTODIA invoca `registerSkillPack` en ese mismo workspace de Rocío. El usuario interactúa con la misma identidad, que ahora domina CUSTODIA.
- **Si NO existe Alddea**: CUSTODIA levanta su propia instancia de OpenClaw con únicamente el `CUSTODIASkillPack` habilitado.

## Skills Proyectadas
1. **Dueños**: Consultar estado de cuenta, revisar historial fotográfico de mantenimiento, aprobar gastos.
2. **Inquilinos (Fase 2)**: Consultar saldo, iniciar pago recurrente, reportar desperfectos, consultar contrato.
3. **Property Managers / Staff**: Consultar calendario, reportar alertas, listar tareas diarias.
4. **Dependencia cruzada (RAVSIS)**: Escalar alertas de seguridad o consultar cobertura.

## Dependencias Críticas
- **Fase 1**: Datos base para dueños (Finanzas/Órdenes).
- **Fase 2**: Datos base para inquilinos.
- **Fase 5.7 (Conectores)**: Exposición de la interfaz para la fusión de Skills.
- **Seguridad**: Sujeto al marco de validación detallado en `SECURITY.md` (superficie de agente no confiable).
