# Integración Mercado Libre — POLIPLAST y FOAM

## Alcance inicial

Una única aplicación de Mercado Libre autoriza dos cuentas seller independientes. El CRM conserva una credencial cifrada por cuenta y únicamente ejecuta lecturas. No modifica publicaciones, precios ni stock.

## Preparación

1. Ejecutar `docs/MIGRACION_MERCADOLIBRE.sql` en Supabase.
2. Crear una aplicación para Mercado Libre (no Mercado Pago) desde el panel de Developers.
3. Registrar exactamente esta URL de redirección:
   `https://poli-crm.vercel.app/api/mercadolibre-callback`
4. Configurar en Vercel, solamente para el servidor:
   - `MELI_CLIENT_ID`
   - `MELI_CLIENT_SECRET`
   - `MELI_REDIRECT_URI`
   - `MELI_OAUTH_STATE_SECRET` (aleatoria, mínimo 32 caracteres)
   - `MELI_TOKEN_ENCRYPTION_KEY` (aleatoria, mínimo 32 caracteres y distinta de la anterior)
5. Redesplegar y abrir **Canales → Mercado Libre**.
6. Conectar POLIPLAST iniciando sesión con el administrador de esa cuenta.
7. Repetir con FOAM. Antes de aceptar, comprobar visualmente que Mercado Libre muestra la cuenta correcta.

## Seguridad

- Los tokens nunca se entregan al navegador ni aparecen en logs o respuestas.
- El estado OAuth está firmado y vence a los diez minutos.
- Los tokens se cifran con AES-256-GCM antes de guardarse.
- Las tablas no conceden acceso directo a usuarios del navegador; se consultan únicamente mediante endpoints autenticados.
- Una sincronización solo usa la credencial asociada al `seller_id` de esa cuenta.

## Validación antes de automatizar reportes

Comparar durante dos semanas los conteos del CRM contra el panel de Mercado Libre. Recién después de alcanzar paridad se deben pausar las tareas que dependen de Chrome.

