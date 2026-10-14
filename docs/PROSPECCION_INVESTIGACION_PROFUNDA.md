# Prospección: investigación profunda (diseño y estado)

## Qué se quiere
Un botón que haga una **investigación profunda** por familia, como las guías e informes del equipo
(Penosil, Carrozados/PRFV, Química): público objetivo, señales que confirman, exclusiones, tabla con
evidencia y fuente por empresa, cruzada contra lo que ya está cargado. Que avise que está
trabajando, cuánto tarda y cuándo se puede volver a buscar. Sin costo extra.

## Lo que se puede y lo que no
- El servidor del CRM **no puede usar la suscripción** de Claude/ChatGPT/Gemini por detrás (no hay API
  sin costo y las suscripciones no la incluyen). Por eso la "inteligencia" corre en la IA que elija el
  usuario, con su modo de investigación avanzada, y el CRM orquesta.
- Fuentes gratis que el CRM sí consulta solo: OpenStreetMap (búsqueda rápida) y el sitio web de cada empresa
  (redes, WhatsApp, mail; respeta robots.txt).
- Redes sociales y Google Maps: se recorren desde la IA con navegación (o con la extensión de Chrome);
  el CRM no raspa Instagram/Facebook/Google.

## Flujo implementado
1. **Preparar investigación**: familia + alcance + cantidad. El CRM arma el pedido con la guía de la familia
   (`src/prospect-playbook.mjs`) y excluye las empresas ya cargadas (clientes y prospectos).
2. **Copiar pedido** y abrir Claude / ChatGPT / Gemini / Perplexity en modo investigación (10 a 30 min).
3. **Pegar el resultado** (tabla markdown o CSV): vista previa con cruce (nuevas / ya en CRM / posibles
   duplicadas) e importación como "No contactado", fuente "Investigación IA", con evidencia y tamaño en notas.
4. El trabajo queda en estado Preparada → En curso → Resultado listo → Importada, y sugiere volver a investigar
   la misma familia y alcance a los 7 días.

## Pendiente
- Guías específicas para Carrozados Imperpur, Planchas, Resinplast, PURMAC, Poliurea, Baldes, Pisos, Almohadas
  (hoy usan una guía genérica con los rubros de partida). Se cargan a medida que haya informes.
- Aprendizaje continuo: usar lo que el equipo marca (Contactado / Con interés / Sin interés) para ajustar las guías.
- Competencia: no es sección del CRM; se mantiene en memoria de Drive.
- Prueba con la extensión de Chrome automatizando Google Maps y redes (ver prompt en el chat del 14/10).
