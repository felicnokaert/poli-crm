# WhatsApp + Meta: estado y diagnóstico (14/10/2026)

Documento de continuidad. Resume lo que se verificó contra Meta y contra la base
real, lo que se descartó y lo que sigue. No contiene secretos.

## 1. Resumen

- El CRM multiusuario funciona: cada usuario tiene su espacio, sus canales de
  WhatsApp y sus datos; las cuentas nuevas arrancan vacías (clientes, ventas,
  unidades de negocio).
- **Solo General recibe mensajes reales** (6.850 eventos reales; Juan y Penosil: cero).
- Conectar números nuevos (Penosil, Juan, Rapyp, los de otros comerciales) está
  **bloqueado por Meta**: el flujo de conexión (QR de coexistencia o SMS) falla con el
  error `#2655111` ("La app de socio no tiene los permisos avanzados de mensajes y
  administración de WhatsApp Business necesarios para el registro"). Se levanta
  pidiendo **acceso avanzado** en Revisión de apps.

## 2. Hechos verificados

| Hecho | Cómo se verificó |
|---|---|
| El token del CRM (`META_SYSTEM_USER_TOKEN`, usuario técnico "Poliplast crm", app Agente Poliplast 857121580457426) es válido, sin vencimiento, con `whatsapp_business_management`, `whatsapp_business_messaging` y `whatsapp_business_manage_events` sobre todos los objetos | Botón Diagnóstico de Datos + depurador de tokens de Meta |
| General (WABA 1620643669067135, +54 9 11 5262-7555, dueño Poliuretano PoliPlast): `CONNECTED`, `CLOUD_API`, calidad `GREEN`, suscripta a las apps "Agente Poliplast" y "Business Agent" | Diagnóstico |
| Penosil (2497921480672168) y Juan (203972567633203): la API de Meta responde "Object ... does not exist, cannot be loaded due to missing permissions, or does not support this operation" aunque el token es válido y "aplica a todos los objetos" | Diagnóstico |
| El webhook real es de la app Agente Poliplast: `https://poli-crm.vercel.app/api/whatsapp-webhook`, campo `messages` suscripto | Panel de la app (Casos de uso > Conectar en WhatsApp > Paso 2) |
| La app Poliplast CRM (3817711311858147, modo desarrollo) tiene un webhook viejo hacia otro proyecto de Supabase; no recibe tráfico real | Panel de la app |
| El número +54 9 11 6856-5952 (Rapyp) **no está en ninguna cuenta de Meta**: solo existe en la app WhatsApp Business del celular | Auditoría de los 5 portfolios |
| General ya figuraba "Conectado" el 28/08/2026, antes de que existiera código de conexión en el CRM. El CRM solo suscribió el webhook (`subscribed_apps`) | `docs/WHATSAPP_INTEGRATION.md` + historial |

## 3. Lo que se descartó

- **Un `waba_id` guardado roto**: el ID está fijo en `api/meta-subscribe.js`; la cuenta existe.
- **Un parámetro `featureType` perdido en el flujo de conexión**: el código lo manda; el error es de permisos de la app.
- **Polling**: el CRM nunca consulta mensajes a Meta; recibe solo por webhook.
- **El token vencido o sin permisos**: el diagnóstico lo valida.
- **Falta de acceso del usuario técnico a Penosil**: se le asignó control total y el error persiste. La causa más probable es que Penosil y Juan existen solo como "app de WhatsApp Business" sin registro en la Cloud API.
- **Migrar o volver a agregar el número desde el panel de Meta**: pide SMS o llamada y lo desvincula de la app del celular.

## 4. Lo que sigue (en orden)

1. **Pedir acceso avanzado** (App Review) para `whatsapp_business_management` y
   `whatsapp_business_messaging` en la app Agente Poliplast. Requisitos:
   - Negocio verificado (hecho el 28/08/2026) y app "Publicada" (hecho).
   - URLs en Configuración básica: `https://poli-crm.vercel.app/privacidad.html`,
     `/terminos.html`, `/eliminacion-datos.html` (ya publicadas).
   - Cuenta de revisor en el CRM con contraseña propia y datos de ejemplo.
   - Video de 3 a 5 minutos con el número de General: Sincronizar, Diagnóstico y un
     mensaje entrante apareciendo en "Por revisar".
   - Textos (inglés): ver sección 5.
2. **Cuando Meta apruebe**: Datos > "Conectar mi número con Meta" > escanear el QR con
   la app WhatsApp Business > el CRM muestra el ID del número > Datos > Canales de
   WhatsApp > crear el canal con el ID y el mail del usuario.
3. **Pendiente de producto**: que al terminar el QR el CRM cree solo el canal del
   usuario y suscriba su WABA (hoy el ID del número se copia a mano). Requiere un
   campo de ID de cuenta (WABA) en `whatsapp_channels`. No se construyó porque no
   se puede probar de punta a punta hasta la aprobación.
4. **Alternativa para probar antes de la aprobación**: las líneas ya "Conectadas" en
   Poliuretano PoliPlast (+54 9 11 6260-1062, imperpur +54 9 223 675-6041) pueden estar
   en la Cloud API. El Diagnóstico ya las incluye (solo lectura). Si alguna lo está y no
   tiene chats de clientes reales, se puede asignar a un usuario de prueba.

## 5. Textos para App Review

**whatsapp_business_management**

> Poliplast Sales Copilot is an internal CRM used by the sales team of Poliuretano y
> Plástico Proyectado S.R.L. (Grupo Poliplast, Argentina). We use
> whatsapp_business_management to: (1) subscribe our app to webhooks of the company's own
> WhatsApp Business Accounts (POST /{waba-id}/subscribed_apps) so incoming messages reach
> the CRM; (2) read the status, platform type and quality of the company's phone numbers
> (GET /{waba-id}/phone_numbers) to show each salesperson whether their number is
> connected; and (3) complete Embedded Signup (coexistence) so each salesperson can
> connect their own existing WhatsApp Business number without losing the WhatsApp Business
> app. We only access WhatsApp Business Accounts that belong to our own business
> portfolio. We do not serve third-party businesses.

**whatsapp_business_messaging**

> We use whatsapp_business_messaging to receive message events (messages webhook) from the
> company's WhatsApp Business numbers. Events are stored in the CRM so each salesperson
> keeps a commercial history of every customer conversation, can classify it (ignore,
> memory only, follow-up) and create tasks. The CRM does not send automated messages:
> salespeople reply from the WhatsApp Business app (coexistence). Any future outbound
> message will require explicit human action and will follow Meta's WhatsApp Business
> Messaging Policy and opt-in rules.

## 6. Notas operativas

- **Plan Hobby de Vercel**: máximo 12 funciones en `api/`. Hoy hay 10; el diagnóstico vive
  dentro de `api/meta-subscribe.js` (acción `diagnose`) para no consumir otra.
- **Variable `WHATSAPP_BRIDGE_TOKEN`** en Vercel: resto del puente de la extensión de
  Chrome (desactivado, el endpoint devuelve 410). Se puede borrar.
- **Seguridad**: una contraseña compartida de las cuentas del equipo apareció en texto
  plano en un chat. Debe cambiarse y cada usuario debe tener la suya.
- **Evento de prueba** `prueba-crm-penosil-001` (canal Penosil): se puede borrar desde
  "Por revisar" > Acciones. El borrado por SQL desde el conector expiró.
- **Conector de Supabase**: las operaciones de políticas (DDL) y algunos `DELETE`
  expiran a los 60 s; verificar el estado después de un timeout.
