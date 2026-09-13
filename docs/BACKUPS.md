# Backups: qué hay hoy y qué falta

Contexto: hallazgo de la auditoría de madurez ("sin backups automatizados
verificables documentados"). Esto documenta lo que se pudo confirmar
consultando Supabase directamente (vía MCP, 2026-09-13), sin inventar una
política que no existe.

## Confirmado: el proyecto está en el plan Free de Supabase, sin backups automáticos

- Organización `felicnokaert's Org` (id `giaisfnwsxeghdasvnrl`): plan **`free`**
  (confirmado con `get_organization`).
- Proyecto de este CRM: **`poli crm`** (`nghwmtccpovrdtzvllwe`, región
  `sa-east-1`, Postgres 17.6, `ACTIVE_HEALTHY`).
- Según la documentación oficial de Supabase (Database Backups): los
  backups diarios automáticos y el Point-in-Time Recovery (PITR) sólo están
  disponibles desde el plan **Pro** en adelante. Cita textual: *"We
  automatically back up all Pro, Team, and Enterprise Plan projects on a
  daily basis (...) We recommend that free tier plan projects regularly
  export their data using the Supabase CLI `db dump` command and maintain
  off-site backups."*
- Conclusión: **hoy no hay ningún backup automático de la base de datos de
  este CRM.** Si se borra o corrompe algo en `workspace_states` o
  `whatsapp_events`, Supabase no tiene una copia propia para restaurar.

Lo que NO se pudo confirmar por este medio: si en algún momento se activó
manualmente algún export/dump programado fuera de Supabase (cron externo,
script en otra máquina, etc.). No hay evidencia de eso en el repo ni en la
configuración del proyecto — hasta que alguien confirme lo contrario, hay
que asumir que no existe.

## Lo que sí existe hoy como respaldo manual: exportación desde el CRM

`Datos` → `Configuración de datos` (`src/DataSettings.jsx`) ya tiene, desde
antes de esta ronda:

- **Descargar CSV**: exporta las fichas de clientes (todas o filtradas por
  unidad de negocio).
- **Descargar JSON**: exporta el estado completo del workspace
  (`clients`, `tasks`, `interactions`, `sales`, etc.) como un único archivo.
- **Restaurar JSON**: permite volver a cargar ese archivo si hace falta.

Esto sirve como respaldo adicional, pero depende de que una persona lo haga
a mano — no es automático ni verificable (nadie puede confirmar hoy cuándo
fue la última vez que alguien lo corrió).

## Qué falta para tener una política real

1. Decidir si vale la pena pasar el proyecto a un plan de pago de Supabase
   (backups diarios automáticos desde Pro) dado el volumen de datos
   comerciales que ya maneja.
2. Si se queda en Free: programar un `supabase db dump` periódico (cron
   externo) que guarde el archivo fuera de Supabase, y confirmar que
   corre — hoy no hay nada así configurado.
3. Como mínimo mientras no se resuelva 1 o 2: bajar el JSON de "Descargar
   JSON" con alguna periodicidad conocida y guardarlo en un lugar aparte
   (Drive, etc.), a sabiendas de que es manual y depende de que alguien lo
   haga.
