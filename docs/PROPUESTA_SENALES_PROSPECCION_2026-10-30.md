# Propuesta: señales de prospección (idea tomada de Harvey) — 30/10/2026

Solo propuesta: no se cambió código. Hoy el puntaje (src/prospect-queue.mjs `prospectScore`, reglas editables en Prospección → Reglas) suma por: teléfono, WhatsApp, web, mail, redes, evidencia, familia, puntaje de investigación, encaje/zona de la planilla, y resta por posible duplicado.

## Qué es una "señal"
Un dato que dice si la empresa probablemente nos compre o nos sirva como aplicador, sacado de fuentes gratis (la web de la empresa, el mapa, redes). Harvey usa unas 26 gratis y el usuario confirma cuáles quiere. La idea es igual: lista de señales, cada una con sus puntos editables.

## Señales propuestas (todas gratis, en orden de valor)
1. **Su web menciona nuestros rubros**: espuma, poliuretano, poliurea, aislación, impermeabilización, pileta, fibra de vidrio, resina, baldes, pintura. Suma por cada rubro (tope 3). Se lee con 1 a 3 pedidos HTTP por empresa.
2. **Su web menciona a un competidor o a una marca nuestra** (Penosil, Purmac, Alkanos, Kilcom…): competidor = ya compra en el rubro (suma); distribuidor de nuestra marca = no es prospecto (resta).
3. **Es aplicador/instalador** (palabras: aplicamos, instalación, obra, colocación, servicio): suma fuerte, es RAPYP.
4. **Reseñas y puntaje en el mapa** (cantidad de reseñas, 4 estrellas o más): empresa activa. Suma 1 a 2 puntos. Depende de que la búsqueda ya traiga esos datos.
5. **Redes activas** (Instagram o Facebook con publicaciones recientes): suma 1.
6. **Tiene tienda online o catálogo** (menciona carrito, envíos): puede revender; suma 1.
7. **Cantidad de sucursales o años en el mercado** (si figuran en la web): empresa grande; suma 1.
8. **Está contratando** (sección Trabajá con nosotros): empresa en crecimiento; suma 1.
9. **Ya es cliente de Contabilium** (cruce por CUIT o nombre): sale de prospectos y pasa a cartera (hoy ya se marca "Ya en el CRM").
10. **Zona de cobertura** (ya existe: A/B/C y radio): se mantiene.

Señales que NO conviene tomar de Harvey: publicidad de Google activa, rondas de inversión y posición en buscadores (son pagas o no sirven para nuestro rubro).

## Cómo se implementaría
- Nueva etapa "Leer sitio web" en la investigación del prospecto (ya existe `research.score`): se completa con las señales confirmadas.
- Nueva sección en Prospección → Reglas: lista de señales con tilde (usar o no) y puntos de cada una.
- Cada señal que sumó queda visible en la ficha ("Por qué sube en la cola"), para que sea explicable.
- Pruebas con respuestas de ejemplo; sin costo (solo lectura de webs públicas, sin IA).
- Estimación: 1 sesión de trabajo para 1 a 6; el resto después.

## Cambio de postura sobre enviar (Felipe, 30/10)
Felipe quiere que el CRM pueda responder WhatsApp, enviar mails masivos y mandar mensajes (hasta ahora el CRM solo recibía). Se mantiene el plan por etapas del 28/10 (sugerir → clasificar y avisar → responder solo en temas seguros), sumando mail en frío. Condiciones a resolver ANTES de construir envíos:
- **WhatsApp:** fuera de las 24 h solo plantillas aprobadas por Meta; necesita consentimiento (opt-in) del contacto; Penosil y RAPYP todavía no están en la API.
- **Mail en frío:** dominio y buzón dedicados con calentamiento; baja (opt-out) en cada mail; lista de no contactar; dirección postal; límites diarios. En Argentina hay normas de datos personales y de publicidad: conviene validarlo con un abogado antes de masivos.
- **Control:** bandeja de aprobación, límite diario, pausa de emergencia y registro de todo lo enviado.
- **Primer paso seguro:** bandeja de salida (Outbox) con borradores que una persona aprueba, y pasar a automático solo en los temas que Felipe elija.
