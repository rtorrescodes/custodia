# Análisis de Impacto y Extensibilidad (Scope Expansion - Addendum 3)
**Fecha:** 2026-08-17
**Propósito:** Analizar la viabilidad arquitectónica de fusionar los paquetes de Skills del Asistente Conversacional (Rocío) a través de los Conectores (Sección 5.7), sin romper la independencia de Custodia.

## Análisis de la Interfaz de Integración (5.7)
El requerimiento de "un solo asistente" dictamina que Custodia debe ser capaz de inyectar su `CUSTODIASkillPack` en el runtime de OpenClaw que pertenezca a Alddea.

### 1. El Método `registerSkillPack`
La tabla `TenantIntegration` actualmente guarda una columna `config` (JSON). 
Para soportar OpenClaw, este JSON debe almacenar:
- `openclawWorkspaceId` (si existe la instancia compartida).
- `agentEndpointUrl` (la ruta al gateway del agente de ecosistema).

Cuando la integración está activa, Custodia puede despachar una petición POST al `agentEndpointUrl` con un payload que registre el manifiesto de funciones (Tool Calling JSON Schema) y los webhooks de callback que apuntan a los *Server Actions* de Custodia.

### 2. Viabilidad y Aislamiento
Esta estrategia mantiene a Custodia 100% aislada:
- Custodia no importa librerías ni lógicas de Alddea.
- Custodia solo expone una API estructurada (vía Server Actions) que cualquier Agente (sea compartido o instanciado localmente) puede consumir.
- La responsabilidad de orquestar la conversación recae en el Gateway de OpenClaw.

## Conclusión
La arquitectura de Conectores (Fase 5.7) es perfectamente capaz de extenderse con un método `registerSkillPack`. La adopción de OpenClaw como una capa sobre *Server Actions* asegura que la Fase 13 se construya en aislamiento de dominio y cumpla el paradigma *Zero Trust*.
