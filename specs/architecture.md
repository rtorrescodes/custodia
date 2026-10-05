# Connector Architecture: CUSTODIA (Alddea & RAVSIS)

## 1. Objetivo
Diseñar una capa de abstracción ("Plugin/Connector Layer") que permita la integración de CUSTODIA con Alddea y RAVSIS, sin acoplar fuertemente la lógica interna a las APIs de estos sistemas, y asegurando que CUSTODIA pueda operar 100% independiente.

## 2. Modelo de Integración por Tenant
Cada inquilino (empresa PM) puede o no tener activadas estas integraciones. Esto se maneja mediante la tabla `TenantIntegration`.

```prisma
model TenantIntegration {
  id               String   @id @default(uuid())
  tenantId         String
  provider         String   // "ALDDEA" | "RAVSIS"
  isActive         Boolean  @default(false)
  config           Json     // Tenant specific config
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```
*NOTA:* Las claves de API secretas y tokens no se almacenan en `config`, sino en el Gestor de Secretos (Google Secret Manager o Supabase Vault), usando `tenantId` y `provider` como llaves de búsqueda.

## 3. Contrato de Interfaz Abstracta (Ejemplo TypeScript)
```typescript
interface IExternalSystemConnector {
  // Inicialización con configuración del tenant
  initialize(tenantId: string): Promise<void>;

  // Chequeo de estado de la conexión
  checkStatus(): Promise<boolean>;

  // Método genérico de sincronización de datos
  sync(entity: string, data: any): Promise<void>;

  // Recepción de webhooks desde el sistema externo
  receiveWebhook(payload: any, signature: string): Promise<void>;
}
```

## 4. Feature Flags
En el frontend, las secciones relacionadas a Alddea (ej. "Accesos al Fraccionamiento") o RAVSIS (ej. "Alertas de Seguridad") estarán envueltas en un componente o hook que evalúe si la integración está activa (`isActive = true`).
```tsx
if (!integrations.has('ALDDEA')) return null;
return <AlddeaAccessPanel propertyId={property.id} />
```

## 5. Pruebas y Desarrollo
Para la fase de desarrollo del MVP, se construirá un `MockConnector` que implementará `IExternalSystemConnector` devolviendo respuestas falsas controladas. Cuando las especificaciones y APIs de Alddea/RAVSIS sean liberadas, solo se creará una nueva clase `AlddeaConnector` sin necesidad de refactorizar el núcleo de CUSTODIA.
