# Despliegue privado

## Arquitectura elegida

- Frontend y funciones HTTPS: Vercel.
- Autenticación, base y tiempo real: Supabase.
- Captura de WhatsApp: Meta Cloud API mediante `/api/whatsapp-webhook`.
- Pruebas previas a Meta: `/api/simulate-whatsapp`, protegido con un token independiente.

## Preparación completada

- Inicio de sesión sin contraseña mediante enlace por email.
- Usuario productivo restringido a `felipecnokaert@gmail.com` mediante RLS.
- Estado completo del CRM sincronizable online y respaldado también en el navegador.
- Eventos entrantes en tiempo real.
- Webhook con validación de firma de Meta.
- Deduplicación por `event_id`.
- Endpoint de salud sin exposición de secretos.
- Simulador protegido para General y Penosil.

## Acciones externas pendientes

Estas acciones crean recursos externos y se realizan con Felipe presente:

1. Crear o elegir proyecto Supabase.
2. Ejecutar `docs/ONLINE_DATA_MODEL.sql`.
3. Crear/invitar el usuario `felipecnokaert@gmail.com` en Supabase Auth.
4. Crear o elegir proyecto Vercel conectado a este repositorio.
5. Cargar las variables de `.env.example` en Vercel; nunca pegarlas en documentos o chats.
6. Registrar la URL productiva como redirect permitido en Supabase Auth.
7. Ejecutar pruebas con el simulador.
8. Tras la aprobación de Meta, registrar el webhook y completar los dos `phone_number_id`.

## Prueba sin Meta

Con base y despliegue activos, un evento ficticio se envía al simulador con:

- canal `general` o `penosil`;
- nombre y número ficticios;
- texto ficticio;
- encabezado Bearer con `COPILOT_SIMULATOR_TOKEN`.

El resultado esperado es que el mensaje aparezca en la Bandeja WhatsApp en tiempo real. Desde allí se prueban las cuatro decisiones y la creación de clientes/tareas. El token del simulador se elimina o deshabilita al terminar el piloto.

## Secretos

`SUPABASE_SERVICE_ROLE_KEY`, `META_APP_SECRET`, tokens de Meta y `COPILOT_SIMULATOR_TOKEN` son secretos de servidor. No deben incluirse en variables `VITE_*`, archivos versionados, capturas o mensajes.

