# Pedido para el administrador de Google Workspace (grupopoliplast.com.ar)

Hola. Necesitamos conectar el CRM de Poliplast con Gmail para que cada vendedor pueda enviar desde el CRM los mails de prospección desde SU casilla (por ejemplo felipe@grupopoliplast.com.ar) y para que el CRM lea las respuestas. Son unos 15 minutos y no tiene costo.

## Pasos (con la cuenta de administrador del Workspace)
1. Entrar a https://console.cloud.google.com y crear un proyecto llamado **Poliplast CRM** (organización: grupopoliplast.com.ar).
2. En «APIs y servicios → Biblioteca» buscar **Gmail API** y activarla.
3. En «APIs y servicios → Pantalla de consentimiento de OAuth»:
   - Tipo de usuario: **Interno** (así solo pueden usarla cuentas de grupopoliplast.com.ar y Google no pide verificación).
   - Nombre de la app: Poliplast CRM. Correo de soporte: marketing@grupopoliplast.com.ar.
   - Permisos (scopes): `https://www.googleapis.com/auth/gmail.send` y `https://www.googleapis.com/auth/gmail.readonly`.
4. En «Credenciales → Crear credenciales → ID de cliente de OAuth», tipo **Aplicación web**, nombre «Poliplast CRM»:
   - URI de redireccionamiento autorizado: `https://poli-crm.vercel.app/api/gmail-callback`
5. Copiar el **ID de cliente** y el **Secreto del cliente** y cargarlos como variables de entorno en Vercel (proyecto poli-crm, Production) con estos nombres: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. No pasarlos por chat, mail ni documentos.

## Además, por favor revisar (mejora la entrega y evita spam)
- Que el dominio tenga **SPF, DKIM y DMARC** configurados (Admin de Google → Apps → Google Workspace → Gmail → Autenticar correo).
- Que los buzones que van a enviar tengan uso normal (no cuentas nuevas sin historial).

## Cómo lo vamos a usar (para tranquilidad)
- Empieza con 25 mails por persona por día, de lunes a viernes de 9 a 18 hs.
- Cada mail lleva baja; quien responde BAJA entra en la lista de No contactar y no se le escribe más.
- Se frena solo si el destinatario responde, si el mail rebota o si se pausa desde el CRM.
- Cada persona autoriza su propia casilla una vez; el CRM guarda el acceso en el servidor.
