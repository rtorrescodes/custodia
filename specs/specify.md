# Functional Specification (MVP): CUSTODIA

## 1. Visión General
CUSTODIA es una plataforma SaaS diseñada para administradores de propiedades (Property Managers) que cuidan casas de dueños ausentes. Se centra en el mantenimiento, gestión financiera y operabilidad, más que en un simple channel manager de rentas vacacionales.

## 2. Tipos de Usuarios y Roles (RBAC Granular)
- **Super Admin (CUSTODIA):** Soporte operativo. Acceso limitado a datos financieros (auditable).
- **Admin PM:** Dueño de la empresa administradora (tenant), con control total.
- **Gerente de Portafolio:** Supervisa subconjunto de propiedades y tareas de su equipo.
- **Staff Operativo:** Limpieza, mantenimiento, seguridad. Usa app móvil/PWA.
- **Proveedor Externo:** Acceso acotado a las órdenes de trabajo que se le asignen.
- **Dueño:** Portal de sólo lectura para ver estados de cuenta, fotos y aprobar gastos.

## 3. Módulos y Funcionalidades del MVP

### 3.1. Gestión de Propiedades
- Registro completo de vivienda: dirección, fraccionamiento, tamaño, amenidades y accesos.
- Manejo de copropietarios (múltiples dueños por casa).
- Galería de fotos optimizadas (antes y después).

### 3.2. Gestión de Dueños y Transparencia
- Perfiles de dueño con preferencias (idioma y moneda).
- **Portal del Dueño:** Visibilidad de ledger financiero (ingresos/egresos), revisión de evidencias fotográficas, aprobación de gastos.
- Reportes automatizados.

### 3.3. Órdenes de Trabajo y Mantenimiento
- Creación de órdenes (reparación/preventivo) con estado, costos y fotos de evidencia.
- Asignación a staff interno o contratistas externos.
- Checklist para llegadas de dueños/huéspedes con firma o validación fotográfica.

### 3.4. Gestión de Proveedores
- Directorio central de proveedores y contratistas con calificación.
- Flujo de cotización y autorización de gasto.

### 3.5. Finanzas y Pagos (Trust Accounting)
- Ledger por propiedad. Rastreo claro de cada centavo para asegurar separación entre fondos de la empresa PM y los del dueño.
- Localización fiscal mediante plugins (Ej: CFDI 4.0 para México).
- Soporte Multi-moneda con audibilidad.

### 3.6. Comunicaciones
- Notificaciones vía WhatsApp Business API para dueños y staff.
- Bandeja de mensajes integrada y plantillas multi-idioma.

### 3.7. Panel de Control y Auditoría
- Dashboards ejecutivos (ingresos, status) y operativos (checklist diario).
- Bitácora inmutable de auditoría para todas las acciones sensibles.
