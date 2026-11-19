# Control de etiquetas de Mercado Libre por corte (propuesta para Logística)

Preparado por Felipe (Marketing) el 19/11/2026. Es una propuesta para que Logística diga si es lo que necesita, antes de construir nada.

## Qué se quiere
Un control automático de cuántas etiquetas de despacho se imprimen en cada corte del día (8:00, 10:00 y 12:00) y de qué producto son.

- **Qué mide:** cantidad de etiquetas por corte, y por cada producto su SKU y la cantidad de unidades de ese SKU.
- **Qué no mide:** el valor en pesos. No interesa.
- **De dónde:** de las tres razones sociales que hoy venden en Mercado Libre (POLIPLAST, FOAMFACTORY y COMARG), y de las que se sumen después, hasta unas cinco.
- **Cómo se avisa:** una notificación en el celular después de cada corte, con el resumen.
- **Para qué:** controlar el trabajo del día, ver cuánto sale por corte y tener un histórico que sirva para planificar personal y horarios, porque las ventas se comportan con regularidad.

## Qué se puede hacer con la API de Mercado Libre
Mercado Libre deja leer los pedidos y los envíos de cada cuenta con la autorización del dueño. Ya tenemos conectadas las tres cuentas y ya leemos sus pedidos (con SKU y cantidad). Lo que falta confirmar es el estado de la etiqueta de cada envío.

| Punto | Estado |
|---|---|
| Leer pedidos de cada cuenta con SKU y cantidad | Ya lo hacemos hoy |
| Ver el estado de cada envío (listo para imprimir, impreso, despachado) | A comprobar con una prueba de un día |
| Saber a qué hora se imprimió cada etiqueta | A comprobar (el historial del envío debería traer la hora) |
| Sumar más razones sociales | Se puede: cada cuenta autoriza una vez (la persona que la administra) |

Honestidad técnica: no pude leer la documentación oficial de Mercado Libre desde donde trabajo. Lo que dice la tabla como "a comprobar" lo vamos a verificar con datos reales antes de prometer nada.

## Cómo funcionaría
1. En cada corte (8:00, 10:00 y 12:00) el sistema consulta las cuentas y cuenta los envíos con etiqueta impresa desde el corte anterior.
2. Los agrupa por razón social, por SKU y por cantidad.
3. Guarda el resultado. Eso arma el histórico.
4. Manda el resumen al celular.

Ejemplo del aviso de las 10:00:

> Corte 10:00 · 84 etiquetas desde las 8:00 (total del día: 156)
> POLIPLAST 52 · FOAMFACTORY 24 · COMARG 8
> Más pedidos: BLRO-20-1 ×18, PS-810ML-6 ×11, RE-608-750 ×9 …

## Qué cuenta y qué no
- Cuenta lo que se despacha desde nosotros (Colecta, Flex y envío por cuenta propia). Lo que sale por **Full** no tiene etiqueta nuestra, así que no entra.
- Un pedido con varios productos tiene una etiqueta y varios SKU. Se cuenta como una etiqueta y se abren los SKU aparte.
- Los pedidos cancelados antes de imprimir no cuentan.

## Costo y herramientas
- **Costo extra: cero.** Usa la API gratuita de Mercado Libre y la plataforma que ya usa el CRM.
- **Notificación:** la opción más simple y gratuita es un **bot de Telegram** con un grupo de Logística: llega al celular al instante y toda la gente del grupo ve lo mismo. Alternativas: WhatsApp (hoy el número de la empresa no está en condiciones para eso) o una notificación de la app del CRM en el celular (más trabajo y no siempre llega en iPhone).
- **No hace falta contratar un servicio externo:** todo lo necesario ya está armado en el CRM.

## Plan en tres pasos
1. **Prueba de un día, sin notificaciones:** guardamos lo que devuelve Mercado Libre en cada corte y lo comparamos con las etiquetas que Logística imprimió de verdad. Si coincide, seguimos.
2. **Resumen automático y notificaciones** por Telegram.
3. **Histórico y reportes:** por día de la semana, horario, producto y cuenta.

## Lo que necesitamos que Logística conteste
1. ¿Se cuenta una **etiqueta impresa** o un **pedido listo para despachar**? Para ustedes, ¿es lo mismo?
2. ¿El corte es lo acumulado hasta esa hora, o lo impreso **entre un corte y el siguiente**?
3. ¿Se miden Colecta, Flex y cuenta propia por separado o todo junto?
4. ¿Cuántas razones sociales hay hoy y cuáles se suman?
5. ¿Quién recibe las notificaciones? ¿Un grupo o personas?
6. ¿Hay más cortes o días especiales (sábados, feriados)?
7. ¿También se quiere esto para los pedidos de la tienda propia (Shopify)?

## Riesgos y límites
- Si Mercado Libre no entrega la hora de impresión de cada etiqueta, el resumen será "lo impreso hasta ahora" y no "lo impreso entre cortes". Lo vemos en la prueba del paso 1.
- Cada cuenta tiene que autorizar la conexión. Si no tenemos acceso a una razón social, no se puede leer.
- Los envíos de Full no entran.
