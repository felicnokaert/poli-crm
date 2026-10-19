# Poliplast CRM — guía para sesiones de Claude (local o nube)

Felipe (marketing@grupopoliplast.com.ar) no es programador: respondé siempre en **español**, conciso y honesto. No inventes resultados. Sin gastos extra (plata de la empresa; nada de créditos de API).

## Proyecto
React + Vite (SPA), funciones en `api/*` (Vercel), Supabase proyecto `nghwmtccpovrdtzvllwe`, estado por usuario en `workspace_states`. Producción: https://poli-crm.vercel.app

- Tests: `pnpm test` · Build: `pnpm build`
- El CRM solo RECIBE WhatsApp (nunca envía). No borrar ni archivar mensajes viejos de la bandeja.
- Supabase `execute_sql`: usar sentencias cortas y ASCII (los textos largos/acentos/DELETE dan timeout); DDL con `apply_migration`.

## Flujo de trabajo
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session: <url de la sesión>`.
- Felipe autorizó llevar cada tanda a `main` por PR (squash). Si dice "conflictos" tras un squash previo: fetch, `checkout -B` desde origin/main antes de empezar, o merge + `git checkout --ours`, verificar tests/build y reintentar.
- Prospección: los pedidos están en `prospect_requests`; se procesan a mano cuando Felipe dice "procesá los pedidos" (ver `docs/PROSPECCION_CLAUDE_WORKER.md`). Aplicadores = clientes; quien vende máquinas = competidor.

## Equipo (bandeja del equipo, pestaña Equipo)
Mails `nombre@grupopoliplast.com.ar`. Felipe (admin/marketing), Yuliani (jefa de ventas, apoya a Brenda), Brenda (Poliplast/e-commerce, consultas generales de tiendas online; falta seguimiento), Ezequiel (Resinplast e Imperpur; falta seguimiento), Juan (gerente general y de operaciones; máquinas, sistemas de poliuretano, repuestos), David (dueño; la idea es que delegue). Las reglas de reparto son editables en la app.

## Hecho el 16/10 (noche)
Búsqueda global Ctrl+K; tarjeta Mi día en Inicio; menú en 5 grupos; Prospección en pestañas; Bandeja del equipo con vista Para seguimiento, urgencia por espera y tablero de números; Rutina con Cierre del día (salió bien / sin hacer / postergado / mañana); Ventas con historial en gráficos (mensual/trimestral/semestral por año, objetivos vs vendido); Academia con pestañas Buscar (conocimiento unificado) y Equipo (fichas de vendedores, borrador).

## Beta para el equipo (16/10)
- Guía para pasarle al equipo: docs/GUIA_BETA_EQUIPO.pdf (18 páginas con diseño). Se regenera con scripts/capture-guia-beta.mjs (capturas en vista de miembro, localhost) + scripts/build-guia-beta.py + imprimir a PDF con Chromium; ya no hace falta regenerarla con cada cambio (Felipe, 16/10): solo si él lo pide.
- Permisos de lo compartido: cualquiera del equipo carga (competidores, directorio, fichas); solo Felipe borra lo general. Lo personal lo borra cada uno y solo afecta a su cuenta.
- Rutina, plan Trello y tablero Trello son solo de Felipe (src/personal-tools.mjs); el resto ve Cierre del día. Bandeja del equipo apagada (TEAM_INBOX_ENABLED=false).
- Directorio de empresas compartido: tabla shared_companies (Felipe publica, cada uno trae desde Más → Datos). Solo viajan nombre, rubro, ubicación y contactos.
- conversation_assignments restringida por canal (aplicado 16/10 con OK de Felipe).
- Para probar la vista del resto del equipo en localhost: `localStorage.setItem('poliplast-simulate-member','1')` y recargar.
- Cotizador (decidido por Felipe 16/10): sigue en su propio repositorio (poliplast-cotizador), códigos separados. Una cotización NO es una venta: nunca guarda en Ventas, solo sirve para pasar precio. Puede buscar clientes del CRM, darlos de alta si no existen y marcar "Coticé hoy" (client.lastQuotedAt). Se le suman cosas del CRM (copiar para WhatsApp, gráficos, diseño).

## Arreglos beta (16/10, tarde)
- Bug corregido: al iniciar sesión con otra cuenta sin cerrar la anterior, el espacio de Felipe se guardaba en el de esa cuenta (remoteReady ahora es por cuenta; la copia local lleva dueño en `poliplast-sales-copilot-v1-owner`). Limpieza con vista previa: Más → Datos → "Datos tuyos en otras cuentas" (api/admin-users.js action 'cleanup', src/workspace-cleanup.mjs: saca registros con el mismo id que los de Felipe y los marca borrados; las empresas quedan sin sus datos privados).
- Mapa RAPYP solo para Felipe, Juan y David (canSeeRapypMap). El directorio compartido lleva sourceType (clasificación de Felipe) y tipoCliente resuelto (aplicador) para que el resto vea su clasificación.
- El plan Trello de Felipe se descarga solo en su cuenta (import dinámico); el resto tiene "Importar tareas de Trello" (JSON exportado de su tablero) en Tareas. Memoria de precios: todo es + IVA.

- Base técnica (16/10): se sube desde Base técnica → "Subir fichas y documentos" (src/TechnicalUpload.jsx): archivos sueltos o carpeta entera, familia, carpeta existente o nueva, y choques como en Windows (Reemplazar / Conservar los dos "(1)" / Omitir; mismo contenido por SHA-256 se omite por defecto). Texto para el copiloto: PDF, .docx, .xlsx, .pptx, .txt, .md, .csv (src/document-text.mjs, sin librerías). Para .doc viejo y otros: scripts/markitdown-carpeta.py (MarkItDown en la compu de Felipe) y se sube el .md. Si el bucket rechaza un tipo que no es PDF, el documento queda igual con su texto.

## Noche 16/10
- Vercel (plan gratis) frena publicaciones por proyecto: "Deployment rate limited — retry in 24 hours" (se ve en el estado del commit en GitHub). Pasó con el cotizador; se destrabó publicando a mano con la herramienta de Vercel (create_deployment desde master). Si un cambio "no aparece", mirar eso primero.
- Para no gastar publicaciones: cada rama subida a GitHub también publica (vista previa). Mergear las ramas en local y subir solo `main`, una vez por tanda.
- Competencia: Felipe reclasifica familias desde cada ficha ("Cambiar familias", solo él) y carga varios con "+ Pegar varios". Pedido de Felipe: Integral, Satch, Spinna y Tecniform NO son de poliuretano; BASF sí. Competidores de poliuretano: Alkanos, Fana Química, Kilcom, Química del Caucho, Polytal, Poliresinas (y hay más). MAS-TIN y Penosil NO son competencia: Poliplast los distribuye (socios/proveedores, 19/10); por eso sus fichas dicen "distribuidor oficial".
- Base técnica en dos pestañas: Documentos (los archivos) y "Qué productos tienen ficha" (catálogo del cotizador contra los documentos). No es duplicado: son dos miradas.

- Tareas que necesitan la base, en orden y con instrucciones: docs/PARA_SESION_CON_BASE_2026-10-17.md.
- Hooks de Claude Code (19/10, `.claude/settings.json`): antes de cada `git push` corren tests y build y frenan la subida si fallan (`.claude/hooks/pre-push.mjs`, ~40 s); `guard.mjs` bloquea borrar el proyecto/la compu y pide el OK de Felipe para forzar subidas, `reset --hard`, `clean -f` y DELETE/DROP/TRUNCATE en la base.

## Pendiente / próximos pasos
- **Agendado para el 24/10 (Felipe, 17/10: "que prueben y vean el sistema" una semana antes):** seguridad. (1) Supabase: Authentication → Sign In / Providers → Email → largo mínimo 8. (2) Cada persona cambia la contraseña compartida en Más → Perfil → Cambiar contraseña. (3) Borrar `WHATSAPP_BRIDGE_TOKEN` en Vercel (puente apagado). Recordárselo a Felipe si la sesión es de esa fecha o posterior.
- Usuarios registrados (16/10): panel solo para Felipe en Más → Datos ("Usuarios registrados": nombre, mail, fechas; borrar). Lista por función SQL admin_list_users() (solo admin de canales); borrado por api/admin-users.js con clave de servicio (no borra administradores ni a sí mismo; su espacio de trabajo queda guardado). El alta pide nombre y apellido (user_metadata.full_name). Las cuentas anteriores sin nombre lo toman de Perfil o de Academia → Equipo.
- Aprobación de accesos (decidido 16/10): cuando TODO el equipo ya se haya registrado, activar que cada cuenta nueva quede "pendiente" hasta que Felipe la apruebe (solo Felipe aprueba, bloquea y revoca). Diseño: tabla crm_access (email, estado), is_poliplast_crm_user() = admins fijos O (dominio @grupopoliplast.com.ar Y aprobado); pre-aprobar a todos los ya registrados; pantalla "Tu cuenta espera aprobación"; panel Más → Datos → Accesos. Probar en localhost antes de publicar (riesgo de dejar gente afuera). La protección de contraseñas filtradas de Supabase es del plan pago: no se usa; la app pide 8+ caracteres (src/password-policy.mjs).
- Bandeja del equipo: hoy muestra contactos que Felipe ya clasificó en su bandeja (no comerciales, cliente, etc.). Felipe quiere revisarlo: filtrar o ocultar los ya clasificados, y que lo clasificado se comparta con el equipo.
- Cotizaciones/presupuestos: conectar con la API de Contabilium (credenciales en variables de entorno seguras de Vercel, nunca en el repo). Ya existen los radares de cotizaciones frías/vencidas en Inicio; la API reemplazaría la carga manual.
- Respuestas sugeridas por marca (Resinplast, Imperpur, máquinas): requieren datos reales de producto; no inventar claims.
- Academia → Equipo: cada persona se describe a sí misma (tabla team_self_profiles; la ven solo ella y Felipe). Lo que Felipe escribió de cada vendedor vive en la base (tabla team_felipe_notes, solo la lee Felipe; ya no está en el código de la app) y no aparece en el buscador del resto. Pendiente: sumar lo que cada uno diga.
- Academia: el buscador ya lee el texto completo de las fichas vigentes y muestra el pedacito (17/10); solo entran las validadas. Falta más conocimiento de producto/usos.
- Instagram/Facebook (@Resinplast, @grupopoliplast, @imperpur, @rapyp): requieren cuentas profesionales y revisión de app de Meta.
- WhatsApp de Meta sin entrega desde el 13/10 (caso de soporte abierto).
- Borradores de pedidos con IA: diferido (requiere presupuesto).
