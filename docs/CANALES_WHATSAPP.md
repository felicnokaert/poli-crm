# Canales de WhatsApp por usuario

Desde la etapa 6 del multiusuario, quién ve qué número de WhatsApp se administra
desde el CRM (**Datos → Canales de WhatsApp**, solo Felipe) y se guarda en la
tabla `whatsapp_channels`. Ya no hace falta tocar código para asignar un número.

## Cómo asignar un número a un comercial

1. **Conectar el número en Meta** (lo hace quien administra la cuenta de Meta
   Business; el número debe usar la app WhatsApp Business para la coexistencia).
   Meta entrega un *Phone Number ID* (solo dígitos).
2. En el CRM: **Datos → Canales de WhatsApp**, completar:
   - Nombre del canal (ej. `WhatsApp RAPYP`).
   - Número visible.
   - ID del número en Meta.
   - Correos de quienes lo usan (separados por coma, `@grupopoliplast.com.ar`).
3. **Crear canal.** El webhook empieza a reconocer ese número en el próximo
   mensaje, y cada persona lo ve la próxima vez que abra el CRM.

Sin ID de Meta el canal queda creado, pero no recibe mensajes todavía.

## Qué ve cada persona

- Quien figura como miembro: la bandeja de ese canal.
- Quien no figura en ningún canal: usa el CRM completo (clientes, ventas,
  tareas, objetivos) sin ver chats de nadie.
- Los canales `general`, `penosil` y `juan` no se pueden eliminar desde la pantalla.

## Cómo funciona por dentro

- `user_allowed_channels()` (base) lee `whatsapp_channels`; la policy de
  `whatsapp_events` filtra por esa función. Es la autoridad real.
- El webhook (`api/whatsapp-webhook.js`) suma los canales de la tabla a los tres
  históricos, que siguen resolviéndose por variables de entorno
  (`WHATSAPP_*_PHONE_ID`). Si la tabla falla, solo usa el entorno.
- En el navegador, `src/user-channels.mjs` conserva el mapa histórico como red
  de seguridad: si la tabla no responde, las cuentas de siempre ven lo de siempre.
- Solo escriben canales `felipe@grupopoliplast.com.ar` y `felipecnokaert@gmail.com`
  (`is_poliplast_channel_admin()`).

## Pendiente / límites

- La extensión del navegador (`extension/pairing.js`) solo acepta los canales
  `general` y `penosil`; no se ajustó en esta etapa.
- Aplicar la migración `20261013120000_whatsapp_channels_table.sql` antes de usar
  el panel. Sin la tabla el panel muestra un aviso y el resto del CRM sigue igual.
