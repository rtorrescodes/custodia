# V0 Prompts Inventory: CUSTODIA

Este documento contiene los prompts listos para ser copiados y pegados en **v0 (Vercel)** para generar los componentes UI de React.

## 1. Dashboard Ejecutivo (Super Admin / Admin PM)
**PROMPT PARA v0:**
> "Crea un Dashboard Ejecutivo para una plataforma SaaS B2B de Property Management (Next.js 15 App Router, Tailwind CSS 3.4, shadcn/ui). El dashboard debe ser responsivo y profesional (estilo enterprise pero moderno).
> Componentes necesarios:
> 1. Sidebar de navegación colapsable (Inicio, Propiedades, Mantenimiento, Finanzas, Integraciones, Configuración).
> 2. Header superior con buscador global, notificaciones, y menú de usuario.
> 3. Panel de métricas clave (KPIs): Total de Propiedades, Ingresos del Mes (USD y MXN), Órdenes de Trabajo Pendientes, Alertas Críticas de Seguridad (con un badge rojo).
> 4. Una tabla de 'Órdenes de Trabajo Recientes' con columnas: ID, Propiedad, Asignado a, Estado (badge de color) y Costo.
> 5. Los datos deben ser recibidos vía props (interface DashboardProps).
> 6. No uses un diseño saturado ('Dashboard Overuse' style), prioriza la legibilidad y espacio en blanco. Usa un color primario sobrio (ej. Slate o Zinc)."

## 2. Vista de Detalles de Propiedad
**PROMPT PARA v0:**
> "Crea una vista detallada de Propiedad para un SaaS de Property Management. Debe recibir datos a través de una prop `Property` (id, nombre, dirección, fraccionamiento).
> Componentes:
> 1. Header con el nombre de la propiedad y un botón de 'Crear Orden de Trabajo'.
> 2. Diseño en layout de Grid/Columns.
> 3. Columna izquierda: Información general, carrusel/galería de fotos de la propiedad y amenidades.
> 4. Columna derecha: Lista de Copropietarios (con su porcentaje de participación) y un panel de 'Integraciones Activas' (muestra si tiene conectado Alddea o RAVSIS con íconos de estado).
> 5. Abajo: Pestañas (Tabs) para alternar entre 'Historial de Mantenimiento' y 'Ledger Financiero'.
> 6. Estilo limpio y profesional, sin gradientes excesivos ni texturas innecesarias. Usa Tailwind CSS 3.4 y Server Components asumiendo que los datos vienen precargados."

## 3. Portal de Dueño - Estado de Cuenta Financiero
**PROMPT PARA v0:**
> "Crea una vista de Estado de Cuenta ('Ledger') para el Portal de Dueños en una app de Property Management.
> Contexto: El usuario final es el dueño de la casa (perfil no técnico, busca transparencia).
> Requisitos:
> 1. Tarjetas de resumen en la parte superior: Saldo Actual, Ingresos del Mes, Egresos del Mes.
> 2. Tabla detallada de transacciones (trust accounting). Columnas: Fecha, Tipo (Ingreso/Egreso), Categoría, Descripción, Monto (soporte multi-moneda MXN/USD), Recibo (botón para ver factura/evidencia).
> 3. Los egresos por encima de un umbral deben tener un botón de 'Aprobar Gasto' si están pendientes.
> 4. Incluye los estados vacío (no hay transacciones), cargando (skeletons), error y éxito.
> 5. Diseño responsivo (usable en móvil)."
