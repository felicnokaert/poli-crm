# Plan: que la prospección del CRM funcione como Harvey (30/10/2026)

Pedido de Felipe: que el CRM consiga prospectos, escriba y envíe mails y mensajes, lea las respuestas y mejore la parte de prospección. Se arma por etapas, cada una usable sola y con aprobación humana al principio.

## Lo que ya existe
- Buscar prospectos (Prospección → Buscar con IA, OSM/Google/web) y cargarlos con puntaje, encaje y zona.
- Investigar el sitio: señales (rubros, aplicador, competidor, tienda online, sucursales, contratando) con puntos editables.
- Cola del día con mensajes A/B listos para copiar, resultado en un toque y aprendizaje ("Qué aprendimos").
- Lista de No contactar (filtra las colas).
- Respuestas sugeridas de WhatsApp (borrador que revisa una persona).

## Etapas
1. **Más señales y mejor orden (sin riesgo)**: reseñas y puntaje del mapa, redes activas, cruce con clientes de Contabilium (que un cliente no entre como prospecto), antigüedad. Medir qué señales predicen "Con interés" (usando prospect.history) y ajustar los puntos solos.
2. **Mail por prospecto (borrador)**: el CRM arma un mail de 3 pasos (primer contacto, recordatorio a los 3 días, cierre a los 7) que nombra algo específico de la empresa (la señal encontrada). Queda en una **Bandeja de salida**; una persona aprueba cada uno. Sin envío todavía: se copia o se abre en Gmail.
3. **Envío con aprobación**: el CRM manda desde un buzón dedicado (Gmail/Workspace por API u SMTP), con límite diario, horario de oficina argentino, botón de baja en cada mail, consulta a la lista de No contactar ANTES de cada envío, registro de todo y botón de pausa de emergencia.
4. **Leer respuestas**: clasificar (interesado, pide baja, rebote, pregunta), pasar la baja a No contactar sola, crear la tarea de seguimiento y sugerir la respuesta.
5. **Automático en lo seguro**: seguimientos y respuestas a preguntas simples sin pasar por una persona, solo en los temas que Felipe elija y con pase a una persona si hay duda.
6. **WhatsApp**: mismo circuito sobre la API de Meta (plantillas aprobadas fuera de las 24 h y consentimiento). Depende de registrar Penosil y RAPYP.

## Decisiones que necesito de Felipe antes de la etapa 3
1. Buzón y dominio para enviar: conviene un dominio secundario dedicado (no el principal) con calentamiento. ¿Cuál se usa?
2. Volumen diario inicial (sugerido 20 a 30 por día e ir subiendo).
3. Quién aprueba los mails y desde qué cuenta salen.
4. Texto de baja y dirección que figuran en cada mail.
5. Validar con un abogado el uso de mails en frío con datos de empresas (protección de datos personales en Argentina).

## Costos
Sin gastos nuevos hasta la etapa 3: las etapas 1, 2 y 4 funcionan con reglas y plantillas; la IA (modelo del asistente, con el crédito prepago actual) solo se usa al tocar un botón. El buzón dedicado puede ser una cuenta de Workspace (unos US$ 7 por mes, a confirmar).
