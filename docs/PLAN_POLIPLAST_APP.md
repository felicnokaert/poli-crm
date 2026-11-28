# Plan: Poliplast App (una sola app para toda la empresa)

Acordado con Felipe el 25/11/2026. Este documento es el punto de partida del chat «Poliplast App». Mientras tanto, el chat del CRM
sigue con las mejoras de lo que ya existe (CRM, Entregas) y el chat de conteo con la app de conteo.

## Idea

Hoy hay tres links: el CRM (poli-crm.vercel.app), la app de conteo (poliplast-conteo-stock.netlify.app) y Poli-Recibos (en armado).
La idea es **una sola app, «Poliplast App»**, donde cada empleado ve solo los módulos que le corresponden. A futuro la empresa compra
poli-app.com.ar y se apunta ahí; los links viejos reenvían solos.

- La casa común es este repositorio (poli-crm): ya tiene usuario por persona, permisos por módulo (module_access, Más → Datos → Equipo
  y cuentas) y Vercel no gasta créditos al publicar.
- Todos los empleados tienen usuario propio, **excepto expedición**: una cuenta compartida (expedicion@) y adentro eligen quién son y
  desde qué depósito (como hoy la app de conteo), así lo usan en su celular, el de un compañero o el de la empresa sin loguearse cada uno.
- El nombre «CRM» desaparece de la app: pasa a llamarse **Poliplast App** (el link no se puede cambiar hasta tener el dominio).

## Reglas de trabajo

1. **Nadie se entera** hasta que Felipe diga: se arma en un link de prueba de Vercel que solo conoce Felipe
   (felipe@grupopoliplast.com.ar). Lo que está andando (CRM, conteo, Entregas) no se toca hasta que Felipe diga «pasamos».
2. Lo único visible antes es diseño: gráficos, UX/UI y estilo se mejoran también en los links actuales (no doble trabajo).
3. **Antes de cada paso que afecte a otra persona (ej. Diego) se lo prueba Felipe primero** (local o link de prueba) y él va diciendo.
4. El chat de Poliplast App coordina; los chats de conteo y de recibos siguen trabajando en SUS módulos y se avisan entre sí
   (send_message entre sesiones) para no pisarse.
5. Primero se arma en «papel» el orden de módulos y submódulos; después se ejecuta por etapas, cada una con pruebas.

## Decisión 28/11 (Felipe): UNA app nativa, sin apps adentro

«No quiero que una app esté dentro de otra… no quiero que sea un rompecabezas. Poliplast App es la aplicación y ya.»
Entregas, conteo, etiquetas, dosificado, recibos y cotizador fueron **pruebas piloto**. Cada uno pasa a ser un **módulo nativo** de
Poliplast App: mismo código (este repositorio), mismo login, mismo menú, mismo diseño, sin iframes ni builds metidos en `public/`.
Cuando un módulo ya vive nativo y Felipe lo aprueba, su app piloto se apaga (el link viejo reenvía a Poliplast App).

Orden:
1. **Entregas**: su código ya está en `entregas/` (React + TS): sus pantallas se importan como componentes del menú, con la sesión y el
   cliente de Supabase de la app (sin `crm:sesion`, sin alto por mensajes).
2. **Etiquetas, Conteo y Dosificado**: se pasan las pantallas de poliplast-app a este repositorio (con el chat de Logística). Su base
   (coldwrbfxpdfutbekysr) se sigue leyendo al principio con su propio cliente; unificar bases después.
3. **Cotizador**: sus pantallas pasan a ser el módulo Cotizador (hoy otro repositorio en iframe).
4. **Recibos**: lo último (Next.js con lectura de comprobantes en el servidor; hay que acomodarlo al límite de 12 funciones de Vercel).

Esto reemplaza el paso 3 de las Etapas («primero mostrados como hoy Entregas; después nativos»): se va directo a nativo.

## Menú propuesto (estilo Contabilium, por grupos)

| Grupo | Módulos (submódulos) |
|---|---|
| Inicio | Panel personal (ver abajo) |
| Ventas | Ventas, Cotizador, Prospección, Clientes y contactos, Mapa |
| Canales online | Mercado Libre, Shopify, Productos, Centro de mejoras |
| Logística | Entregas (Pedidos · Expedición hoy · Calendario · Tablero), Etiquetas (Escaneo · Pendientes · Devoluciones · Cortes), Conteo, Dosificado |
| Administración | Recibos (cuando esté listo), Compras (futuro), Facturación (futuro) |
| Equipo | Tareas, Academia, Base técnica |
| Configuración | Perfil, Equipo y cuentas (roles y permisos), Conexiones |

El menú tiene que seguir siendo liviano con muchos módulos: grupos plegables, solo lo que la persona tiene habilitado, buscador (Ctrl+K).

## Roles (conjuntos de módulos; después se ajusta por persona)

- **Administrador**: todo.
- **Comercial**: Ventas, Canales online, Entregas (vista de vendedor), Equipo.
- **Jefe de depósito (Diego)**: Logística completa (Entregas completa, Etiquetas, Conteo, Dosificado), reportes del depósito. Sin datos de ventas.
- **Expedición** (cuenta compartida + «¿quién sos? / ¿qué depósito?»): Logística sin cargar remitos; casi lo mismo que hoy en la app de conteo.
- **Administrativo**: a definir con Felipe (Recibos, Facturación…).

## Inicio (para TODOS)

- Se arma solo con los módulos que tiene la persona (expedición no ve tarjetas de ventas).
- Cada persona puede **ordenar** sus tarjetas (arriba/abajo, mostrar/ocultar). Es lo único que cualquiera puede editar de la app.
- Con IA: detectar qué usa cada uno y sugerir/reordenar según su uso (siempre dentro de sus módulos).

## Asistente según el usuario

- El asistente se adapta a los módulos de la persona: **nunca** le pasa datos de módulos que no tiene (ej. expedición no puede
  preguntar cuánto compró un cliente). Esto se controla en el SERVIDOR (qué contexto se arma y qué tablas se leen), no solo en el texto
  del prompt.
- Para cada rol ayuda con el uso de la app en sus módulos (expedición: cómo despachar, subir una guía, firmar un remito…).

## Seguridad (antes de habilitar expedición en Poliplast App)

- Hoy la cuenta expedicion@ puede leer facturación y ~50 tablas del CRM; por eso nunca se entrega su sesión en el navegador.
- Antes de que expedición entre a Poliplast App con esa cuenta hay que **limitar en la base** (RLS) lo que puede leer a lo de Logística.
  Felipe ya dio el OK para hacerlo cuando se llegue a ese paso (25/11). Probar en el link de prueba antes de publicar.
- Ocultar un módulo en el menú NO protege los datos: la protección real son las políticas de cada tabla (atarlas a module_access/rol).

## Bases de datos

- La app de conteo usa otra base de Supabase (coldwrbfxpdfutbekysr). Al principio queda como está y se conecta por API (como hoy
  Entregas para expedición); unificar las bases es para más adelante, sin apuro.
- Entregas ya es un solo código para CRM y conteo (`entregas/`, `vite build --mode conteo`): es el modelo a seguir para los demás módulos.

## Etapas

0. **Nombre**: «CRM» pasa a «Poliplast App» en toda la app (títulos, menú, guía, asistente, manifest). Rápido y sin riesgo.
1. **Link de prueba solo para Felipe** con el menú nuevo por grupos y los roles como conjuntos de módulos.
2. **Inicio adaptable** (por módulos + orden editable por cada uno) y **asistente por rol** (contexto filtrado en el servidor).
3. **Logística adentro**: Etiquetas, Conteo y Dosificado como módulos (primero mostrados con la identidad de la app, como hoy Entregas;
   después nativos). Probado por Felipe → recién ahí Diego.
4. **Expedición en Poliplast App**: RLS de expedicion@ limitado + modo «¿quién sos? / depósito» en la misma app.
5. **Un solo link**: los operarios pasan a Poliplast App (link de Netlify reenvía); mensaje al depósito y guía actualizada el mismo día.
6. **Recibos** como módulo (hoy es un tercer link en armado; se deja pendiente).
7. **Futuro**: Compras (consumo de Contabilium/ML → qué se termina y quién lo vende → proveedores sugeridos, negociación por mail o
   WhatsApp con aprobación humana: condiciones, envío, calidad, reputación, experiencia previa) y Facturación.

## Diseño común

- La base es el diseño del CRM (DESIGN.md, tokens de color, botones, tablas, gráficos, modo oscuro, la P de carga).
- Se cede: estilos propios de cada app (emojis, botones gigantes). Se unifica: menú, tarjetas, tablas, gráficos, avisos.

## Fechas

- No se toca nada de esto durante el lanzamiento de Entregas (prueba 24-30/11, obligatorio desde el 01/12).
- Arranque sugerido: primera semana de diciembre.
