# Una sola Entregas para el CRM y la app de conteo (25/11)

Esta carpeta (`poli-crm/entregas`) es la ÚNICA fuente de Poli-Entregas. Felipe (25/11): «una sola Entregas, sincronizada, simple».

- **CRM y link directo** (`npm run build`): Supabase con la sesión del usuario. Se publica en poli-entregas.vercel.app y se ve en el CRM (Ventas → Entregas).
- **App de conteo** (`npx vite build --mode conteo --base=/entregas/ --outDir <dist>/entregas`): expedición SIN login. Habla con la función
  `entregas-crm` de la app de conteo (`src/lib/expedicionApi.ts`), que guarda la clave del CRM. Nunca hay sesión de `expedicion@` en el navegador.

Qué cambia en modo conteo (todo sale de `src/lib/cliente.ts`, ya no hay parches a mano):
- `CON_ARCHIVOS = false`: sin imprimir ni «Cargar remito» (los remitos los cargan los vendedores).
- `CON_SUBIR = true`: guías, remitos y remitos firmados se suben por la API del CRM, con emparejado y pestaña «Sin asignar».
- `GUIA_LEIDA_AL_SUBIR = true`, `TIPOS_SUBIDA` = guía, remito y remito firmado.
- Estilos propios en `src/conteo.css` (tablero del depósito `#/pantalla`, P de carga, firma), cargados solo en ese modo.
- La guía apunta a la de la app de conteo.

**La app de conteo NO edita esta carpeta.** Su build copia `poli-crm/entregas` tal cual (sin parches) y compila en modo conteo.
Un cambio para expedición se pide al chat del CRM (o se hace acá y se avisa), y lo ven los dos lados.
