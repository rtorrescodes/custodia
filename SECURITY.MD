Revisa todos los endpoints de mi API que reciben un ID (usuario,
pedido, documento, etc.) por parámetro de URL o body. Verifica que
cada uno compruebe que el usuario autenticado es realmente el dueño
del recurso o tiene permiso para acceder a él, antes de devolver o
modificar datos. Si encuentras endpoints donde solo se confía en el
ID sin validar propiedad/permisos, corrígelos añadiendo esa
comprobación y explícame qué cambiaste y por qué.

Audita mis endpoints de API y dime cuáles no tienen autenticación o
autorización, cuáles aceptan peticiones desde cualquier origen (CORS
abierto), y cuáles no tienen rate limiting. Corrige lo necesario
para que: (1) cada endpoint sensible exija autenticación, (2) CORS
solo permita los dominios que yo defina, (3) haya rate limiting
básico en endpoints públicos o de login.

Analiza el package.json (o requirements.txt/composer.json/etc.) de
este proyecto, identifica dependencias desactualizadas o con
vulnerabilidades conocidas (usa npm audit / pip-audit / el
equivalente), y dime cuáles son críticas de corregir ya. Actualiza
las que sean seguras de actualizar sin romper el proyecto y avísame
de las que requieran cambios de código.

Revisa la lógica de subida de archivos de mi app. Añade validación
real de tipo de archivo (por contenido/magic bytes, no solo por
extensión), límite de tamaño máximo, y asegúrate de que los archivos
subidos no se puedan ejecutar como código en el servidor. Si guardo
los archivos en una carpeta pública, dime si eso es un riesgo y cómo
mitigarlo.

Revisa todas mis consultas a la base de datos y dime si alguna
concatena o interpola directamente datos del usuario dentro de la
query (riesgo de inyección SQL). Corrige todas esas consultas para
que usen parámetros/prepared statements o el ORM correctamente, en
vez de construir la query con strings.

Revisa cómo estoy guardando y manejando los tokens de autenticación
en el frontend. Si están en localStorage o sessionStorage, migra el
manejo de sesión a cookies HttpOnly, Secure y SameSite, y ajusta el
backend para setearlas y validarlas correctamente. Explícame qué
cambia en el flujo de login/logout.

Revisa la lógica que recibe webhooks de mi proveedor de pagos
(Stripe, PayPal, etc.). Verifica que se esté validando la
firma/secreto del webhook en cada petición antes de procesar el
evento, y que ninguna acción de pago (activar acceso, marcar como
pagado, etc.) dependa únicamente de datos enviados desde el
frontend. Corrige lo que falte.

Revisa mi API/servidor y dime si tengo configurados headers de
seguridad básicos (Content-Security-Policy, X-Content-Type-Options,
X-Frame-Options, Strict-Transport-Security). Añade los que falten
con una configuración razonable. Además, revisa si algún endpoint
devuelve directamente contenido introducido por el usuario sin
sanitizar (riesgo de XSS) y corrígelo.