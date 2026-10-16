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
Menú en 5 grupos; Prospección en pestañas; Bandeja del equipo con vista Para seguimiento, urgencia por espera y tablero de números; Rutina con Cierre del día (salió bien / sin hacer / postergado / mañana); Academia con pestañas Buscar (conocimiento unificado) y Equipo (fichas de vendedores, borrador).

## Pendiente / próximos pasos
- Fichas de vendedores: que cada uno las corrija (hoy son borrador con lo que contó Felipe).
- Academia: sumar texto completo de fichas técnicas al buscador y más conocimiento de producto/usos.
- Instagram/Facebook (@Resinplast, @grupopoliplast, @imperpur, @rapyp): requieren cuentas profesionales y revisión de app de Meta.
- WhatsApp de Meta sin entrega desde el 13/10 (caso de soporte abierto).
- Borradores de pedidos con IA: diferido (requiere presupuesto).
