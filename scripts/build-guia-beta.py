import base64, html, os
IMG='/tmp/claude-0/guide'
def img(name, cap):
    p=f'{IMG}/{name}.jpg'
    b=base64.b64encode(open(p,'rb').read()).decode()
    return f'<figure><img src="data:image/jpeg;base64,{b}" alt="{html.escape(cap)}"><figcaption>{html.escape(cap)}</figcaption></figure>'

# (id, titulo, para_que, que_probar[], imagenes[(file,cap)])
MODS=[
('Barra superior','Siempre a la vista, arriba de cada pantalla.',
 ['Fecha, hora de Argentina en vivo y clima de Mar del Plata y Berazategui. Tocá "¿Dónde estás?" y escribí tu ciudad para ver su hora y su clima.',
  'Botón de tema: automático (sigue a tu celu o compu), claro u oscuro.',
  'Lupa (o Ctrl+K): búsqueda en todo el CRM: empresas, tareas y prospectos.',
  'Signo de pregunta: atajos de teclado ("/" busca en la pantalla, "n" crea una tarea, Esc cierra).'],
 [('26-modo-oscuro','Modo oscuro')]),
('Inicio','Tu panel del día.',
 ['Qué hacer hoy: tareas vencidas y de hoy, conversaciones calientes sin responder.',
  'Plan de hoy: una lista tuya para anotar y tildar lo que querés resolver.',
  'Metas de la semana: contactos, contactos efectivos y propuestas activas contra tu objetivo.',
  'Radares: clientes para recomprar, cotizaciones frías o vencidas y clientes sin contacto hace tiempo.'],
 [('01-inicio','Inicio')]),
('Por revisar','Los mensajes de WhatsApp que entran a tu número, para clasificar y registrar.',
 ['Cada mensaje se puede registrar como conversación, convertir en tarea o descartar.',
  'Ojo: hoy solo muestra mensajes si tu número de WhatsApp está conectado al CRM. Si lo ves vacío es lo esperado en esta beta.'],
 [('02-por-revisar','Por revisar')]),
('Tareas','Todo lo que tenés que hacer, con fecha. Tiene tres pestañas.',
 ['Tareas: crear, completar y buscar tareas con empresa, fecha y prioridad. Podés exportarlas a CSV.',
  'Cierre del día: al terminar (o al empezar) el día te muestra qué salió bien, qué quedó sin hacer, qué se postergó y qué viene mañana. Cada tarea pendiente se puede pasar al próximo día hábil con un toque.',
  'Calendario: tus tareas y eventos con hora (visitas, reuniones, llamadas) en un mes. Se puede exportar a Google Calendar (archivo .ics) o abrir una tarea directo en Google Calendar.'],
 [('04-rutina','Cierre del día'),('05-calendario','Calendario')]),
('Cuentas activas','Las empresas con las que estás trabajando, ordenadas por etapa.',
 ['Mover una cuenta de etapa a medida que avanza la conversación.','Ver cuánto tiempo lleva sin movimiento.'],
 [('06-cuentas','Cuentas activas')]),
('Ventas','Tu resultado comercial. Es privado: nadie más lo ve.',
 ['Objetivos que vos elegís, ventas realizadas y unidades de negocio.','Registrar una venta, importar histórico o subir un PDF de factura.'],
 [('07-ventas','Ventas')]),
('Prospección','Buscar empresas nuevas para venderles. Tiene tres pestañas.',
 ['Prospectos: tu cola de trabajo. Cada prospecto trae un borrador de primer mensaje que podés copiar. El CRM nunca envía nada solo: el contacto es siempre manual.',
  'Buscar con IA: armás un pedido (familia, zona, cantidad) y lo pegás en tu IA (Claude, ChatGPT, Gemini…); después pegás la tabla que devuelve y el CRM la revisa e importa.',
  'Competencia: quién compite en cada familia. Podés cargar un competidor nuevo y pedir que se profundice.'],
 [('08-prospeccion','Prospectos'),('09-prospeccion-buscar','Buscar con IA'),('10-competencia','Competencia')]),
('Historial','Una conversación por cliente, con todo lo registrado.',
 ['Ver el recorrido de cada empresa y retomar donde quedó.'],
 [('11-historial','Historial')]),
('Empresas y contactos','Todas las empresas y las personas de cada una, en un solo lugar.',
 ['Empresas: ficha completa, buscar, importar CSV, detectar y unir duplicados.',
  'Personas de contacto: las personas de cada empresa (una empresa puede tener varias). Al tocar una, abre la ficha de su empresa.',
  'Podés traer las empresas del equipo desde Más → Datos.'],
 [('12-empresas','Empresas'),('13-contactos','Personas de contacto')]),
('Mapa','Dónde está cada cliente y cada prospecto.',
 ['Tres pestañas: aplicadores (RAPYP), ventas y prospectos.','Las empresas sin ubicación aparecen en "Pendientes de ubicación" para completarlas. El mapa se ve completo en la versión en línea.'],
 []),
('Academia comercial','Todo lo que sabe y enseña el CRM. Es para todos y se va a seguir ampliando.',
 ['Buscar: una sola búsqueda en productos, fichas técnicas, clientes, vendedores, objeciones y competencia.',
  'Método: el proceso comercial E-C-E-R-A y sus etapas.',
  'Objeciones: cómo responder cada una ("está caro", "lo tengo que pensar", etc.).',
  'Perfiles: qué busca cada tipo de cliente.',
  'Competencia: cómo hablar frente a cada competidor.',
  'Equipo: cómo trabaja cada vendedor y cómo lo asiste el CRM (borrador: ¡corregí tu ficha!).',
  'Biblioteca y práctica: respuestas tipo y ejercicios.',
  'Evaluar conversaciones: pegás una conversación y la puntúa.'],
 [('15-academia-buscar','Buscar'),('17-academia-objeciones','Objeciones'),('18-academia-competencia','Competencia'),('19-academia-equipo','Equipo')]),
('Base técnica','Las fichas técnicas y el catálogo.',
 ['"Preguntale al catálogo": escribís una necesidad (por ejemplo, aislar una casilla rodante) y te devuelve las fichas que aplican, con un texto listo para pegar en tu IA.'],
 [('22-base-tecnica','Base técnica')]),
('Perfil','Tu cuenta.',
 ['Poné tu nombre, tus metas semanales y cambiá tu contraseña.'],
 [('23-perfil','Perfil')]),
('Datos','Importar, exportar y cuidar tu información.',
 ['Directorio de empresas del equipo: "Traer empresas del equipo" suma a tu lista las que Felipe publicó (sin pisar las tuyas).',
  'Importar y exportar empresas, ventas y tareas en CSV; copia de seguridad en JSON.'],
 [('24-datos','Datos')]),
]
CHECK=[
 'Crear tu cuenta con tu mail y entrar (también desde el celu).',
 'Poner tu nombre y tus metas en Perfil.',
 'Traer las empresas del equipo (Más → Datos) y buscar una con Ctrl+K.',
 'Crear una tarea con fecha y completar otra; mirar el Cierre del día.',
 'Cargar un evento con hora en el Calendario y exportarlo a Google Calendar.',
 'Buscar una empresa y mirar sus personas de contacto.',
 'Registrar una conversación y ver cómo queda en Historial.',
 'Probar Prospección: abrir un prospecto y copiar el borrador de mensaje.',
 'En Academia → Buscar, buscar un producto o una objeción real que te haya pasado.',
 'Corregir tu ficha en Academia → Equipo: ¿cómo trabajás realmente? Anotalo y mandáselo a Felipe.',
 'Cambiar el tema (claro, oscuro, automático) y mirar el clima de tu ciudad.',
 'Usar el CRM un día entero y anotar todo lo que te frenó, te confundió o te faltó.',
]
FUT=[
 ('Vincular con Meta','WhatsApp, Instagram y Facebook de las cuatro marcas (@Resinplast, @grupopoliplast, @imperpur, @rapyp), para que todo entre al CRM.'),
 ('WhatsApp central','Un solo número que reciba las consultas y las derive a cada comercial según el tema.'),
 ('Agente','Un asistente que ordene, sugiera y prepare respuestas con lo que ya sabe la Academia.'),
 ('Inteligencia artificial','Borradores de respuesta y de pedidos hechos por IA dentro del CRM, aprendiendo de cada comercial.'),
 ('Cotizador integrado','El cotizador de Poliplast adentro del CRM, con el stock y los precios.'),
 ('Contabilium','Traer presupuestos y facturas automáticamente para el seguimiento de cotizaciones.'),
 ('Tu tablero propio','Que cada uno conecte su Trello y su calendario, no solo el de Felipe.'),
 ('Y todo lo que nos propongas','Esta primera versión es el comienzo. Falta mucho por recorrer y queremos recorrerlo con ustedes.'),
]
PRIV=[('Es de todos (se comparte)',['Academia comercial completa (método, objeciones, perfiles, competencia, equipo, buscador)','Base técnica y catálogo con sus fichas','Competidores cargados','Directorio de empresas (lo publica Felipe y cada uno lo trae cuando quiere)','Mapa de esas empresas']),
      ('Es solo tuyo (privado)',['Ventas, objetivos y números','Comisiones','Tus tareas, tu plan de hoy y tu cierre del día','Tus notas, etapas y conversaciones','Tu historial y tus cuentas activas','Tus cotizaciones'])]

def e(t): return html.escape(t)
css='''
@page{size:A4;margin:16mm 14mm}
*{box-sizing:border-box}
body{font-family:'DM Sans',Arial,sans-serif;color:#262628;font-size:11.5pt;line-height:1.45;margin:0}
h1{font-size:30pt;margin:0 0 6px}h2{font-size:17pt;margin:26px 0 8px;border-bottom:3px solid #ed1c24;padding-bottom:4px}h3{font-size:13pt;margin:16px 0 4px}
.cover{height:250mm;display:flex;flex-direction:column;justify-content:center}
.cover .tag{background:#ed1c24;color:#fff;display:inline-block;padding:4px 12px;border-radius:99px;font-weight:700;letter-spacing:.06em;font-size:10pt;width:fit-content}
.cover p.lead{font-size:14pt;color:#4a4b4e;max-width:150mm}
.beta{background:#fff3df;border-left:5px solid #d9a400;padding:10px 14px;border-radius:8px;margin:14px 0}
.step{display:flex;gap:10px;margin:7px 0}.step>b{background:#ed1c24;color:#fff;border-radius:50%;width:24px;height:24px;flex:0 0 24px;display:flex;align-items:center;justify-content:center;font-size:10pt}
ul{margin:4px 0 4px 18px;padding:0}li{margin:3px 0}
figure{margin:10px 0;break-inside:avoid}figure img{width:100%;border:1px solid #d9d9dc;border-radius:8px}figcaption{font-size:9pt;color:#6a6b6e;margin-top:3px}
.mod h3{break-after:avoid}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{break-inside:avoid;border:1px solid #d9d9dc;border-radius:10px;padding:10px 14px}
.card.ok{border-left:5px solid #2e7d32}.card.pr{border-left:5px solid #c0392b}
.check li{list-style:none}.check li::before{content:"☐ ";}
.road td{padding:6px 10px;border-top:1px solid #e3e3e5;vertical-align:top}.road td:first-child{font-weight:700;width:36%}table{border-collapse:collapse;width:100%}
.figs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.figs figure{margin:6px 0}
.small{font-size:9.5pt;color:#6a6b6e}
'''
def build():
    h=[f'<!doctype html><html lang="es"><meta charset="utf-8"><style>{css}</style><body>']
    h.append('<section class="cover"><span class="tag">VERSIÓN BETA</span><h1>Poliplast CRM</h1><p class="lead">Guía para el equipo: cómo registrarte, qué hace cada módulo y cómo ayudarnos a mejorarlo.</p><p class="small">Grupo Poliplast · octubre de 2026 · https://poli-crm.vercel.app</p><div class="beta"><b>Esto es una beta.</b> Es una primera versión y nos falta mucho por recorrer. La armamos para el equipo y queremos que la prueben, la rompan y nos digan qué sacar, qué agregar y qué cambiar. Todo lo que encuentren nos sirve.</div></section>')
    h.append('<h2>1. Cómo registrarte</h2><div class="step"><b>1</b><div>Abrí <b>https://poli-crm.vercel.app</b> desde la compu o el celu.</div></div><div class="step"><b>2</b><div>Tocá <b>"Crear cuenta nueva"</b>.</div></div><div class="step"><b>3</b><div>Escribí <b>tu mail de la empresa</b>: <i>tunombre@grupopoliplast.com.ar</i>. Con otro dominio no deja crear la cuenta.</div></div><div class="step"><b>4</b><div>Elegí una contraseña (mínimo 6 caracteres; mejor 10 o más y que no uses en otro lado) y tocá <b>"Crear cuenta"</b>.</div></div><div class="step"><b>5</b><div>Te llega un mail para <b>confirmar la cuenta</b>. Abrilo y tocá el enlace. Si no aparece, mirá en spam y avisale a Felipe.</div></div><div class="step"><b>6</b><div>Volvé a la página, tocá <b>"Ingresar"</b> con tu mail y tu contraseña.</div></div><div class="step"><b>7</b><div>Primeros pasos: en <b>Perfil</b> poné tu nombre y tus metas; en <b>Más → Datos</b> tocá <b>"Traer empresas del equipo"</b>.</div></div>')
    h.append('<p class="small">Si te olvidás la contraseña: "Olvidé mi contraseña". También podés pedir un enlace por correo con "Prefiero un enlace por correo". En el celu, para tenerlo como una app: en Chrome, menú ⋮ → "Agregar a pantalla de inicio"; en iPhone (Safari), Compartir → "Agregar a inicio".</p>')
    h.append('<h2>2. Qué es de todos y qué es solo tuyo</h2><div class="two">')
    for i,(t,items) in enumerate(PRIV):
        h.append(f'<div class="card {"ok" if i==0 else "pr"}"><b>{e(t)}</b><ul>'+''.join(f'<li>{e(x)}</li>' for x in items)+'</ul></div>')
    h.append('</div><p class="small">Cada persona tiene su propio espacio de trabajo. Nadie ve tus ventas, tus números ni tus comisiones.</p>')
    h.append('<h2>3. Recorrido por el CRM</h2><p>En el menú de la izquierda (en el celu, los íconos de arriba) hay cinco grupos: <b>Hoy, Ventas, Cartera, Aprender y Más</b>. Tocá un grupo para abrirlo.</p>')
    for t,que,pts,imgs in MODS:
        h.append(f'<div class="mod"><h3>{e(t)}</h3><p>{e(que)}</p><ul>'+''.join(f'<li>{e(x)}</li>' for x in pts)+'</ul>'+('<div class="figs">'+''.join(img(f,c) for f,c in imgs)+'</div>' if len(imgs)>1 else ''.join(img(f,c) for f,c in imgs))+'</div>')
    h.append('<h2>4. Qué te pedimos que pruebes</h2><ul class="check">'+''.join(f'<li>{e(x)}</li>' for x in CHECK)+'</ul>')
    h.append('<h2>5. Cómo ayudarnos</h2><p>Anotá lo que veas y mandáselo a Felipe (WhatsApp o mail) con estos cuatro datos:</p><ul><li><b>Dónde estabas</b> (qué pantalla).</li><li><b>Qué hiciste</b>.</li><li><b>Qué esperabas</b> que pasara.</li><li><b>Qué pasó</b> en realidad (una captura de pantalla ayuda muchísimo).</li></ul><p>Y no solo errores: <b>ideas, cosas que sobran, cosas que faltan, cómo trabajás vos en la realidad</b>. Lo que contés va a mejorar la Academia y la asistencia de cada uno.</p>')
    h.append('<h2>6. Lo que viene (y lo que falta)</h2><table class="road">'+''.join(f'<tr><td>{e(a)}</td><td>{e(b)}</td></tr>' for a,b in FUT)+'</table><p class="small">Son planes, no promesas de fecha. Algunas cosas dependen de aprobaciones externas (por ejemplo, Meta) y de presupuesto.</p>')
    h.append('</body></html>')
    return ''.join(h)
open('/tmp/claude-0/g/guia.html','w').write(build())

# versión Markdown (solo texto)
md=['# Poliplast CRM · Guía para el equipo (beta)','','> **Esto es una beta.** Es una primera versión y nos falta mucho por recorrer. Queremos que la prueben y nos ayuden a encontrar más soluciones.','','Sitio: https://poli-crm.vercel.app','','## 1. Cómo registrarte','1. Abrí https://poli-crm.vercel.app.','2. Tocá "Crear cuenta nueva".','3. Usá tu mail de la empresa: tunombre@grupopoliplast.com.ar.','4. Elegí una contraseña (mínimo 6 caracteres) y tocá "Crear cuenta".','5. Confirmá la cuenta desde el mail que te llega (mirá spam).','6. Volvé y tocá "Ingresar".','7. En Perfil poné tu nombre y metas; en Más → Datos tocá "Traer empresas del equipo".','','## 2. Qué es de todos y qué es solo tuyo']
for t,items in PRIV: md+= ['',f'**{t}**']+[f'- {x}' for x in items]
md+=['','## 3. Recorrido por el CRM']
for t,que,pts,imgs in MODS: md+=['',f'### {t}',que]+[f'- {x}' for x in pts]
md+=['','## 4. Qué te pedimos que pruebes']+[f'- [ ] {x}' for x in CHECK]
md+=['','## 5. Cómo ayudarnos','Mandale a Felipe: dónde estabas, qué hiciste, qué esperabas, qué pasó (con captura) y también ideas y cosas que faltan.','','## 6. Lo que viene']+[f'- **{a}:** {b}' for a,b in FUT]
open('/tmp/claude-0/g/guia.md','w').write('\n'.join(md)+'\n')
print('ok')
