import base64, html, os
G='/tmp/claude-0/guide'
LOGO='/home/user/poli-crm/public/poliplast-logo.png'
def b64(p, mime): return f'data:{mime};base64,'+base64.b64encode(open(p,'rb').read()).decode()
logo=b64(LOGO,'image/png')
def shot(n): return b64(f'{G}/{n}.jpg','image/jpeg')
e=html.escape

ICON={
'home':'M3 11l9-8 9 8M5 10v10h14V10','inbox':'M3 13h5l1 3h6l1-3h5M3 13l3-8h12l3 8v6H3z','check':'M20 6L9 17l-5-5',
'cal':'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4','target':'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z','receipt':'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
'search':'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5','chat':'M4 5h16v11H9l-5 4z','building':'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3',
'pin':'M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z','cap':'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
'doc':'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7','user':'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6','db':'M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 12c0 2 16 2 16 0',
'lock':'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3','share':'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
'spark':'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z','list':'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01','moon':'M20 14A8 8 0 1110 4a6 6 0 0010 10z','bolt':'M13 2L4 14h7l-1 8 9-12h-7z',
'link':'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1','book':'M4 4h7a3 3 0 013 3v14a2 2 0 00-2-2H4zM20 4h-6M20 4v15h-6',
}
def ic(name, size=22, color='currentColor', sw=1.8):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"><path d="{ICON[name]}"/></svg>'

def frame(n, url, cls=''):
    return f'<div class="frame {cls}"><div class="bar"><i></i><i></i><i></i><span>{e(url)}</span></div><img src="{shot(n)}"></div>'

CSS='''
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--red:#ed1c24;--red2:#c9151c;--ink:#1c1c1f;--ink2:#2a2a2e;--mut:#6b6c70;--line:#e6e6e9;--soft:#f5f5f6;--amber:#d9a400;--green:#2e7d32;--blue:#3b6d9b}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:var(--ink);font-size:10.4pt;line-height:1.5}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;padding:16mm 15mm 14mm}
.page.dark{background:var(--ink);color:#fff}
.page.soft{background:var(--soft)}
h1{font-size:44pt;line-height:1.02;letter-spacing:-.02em;font-weight:800}
h2{font-size:23pt;line-height:1.1;letter-spacing:-.015em;font-weight:800}
h3{font-size:13pt;font-weight:700;letter-spacing:-.005em}
.kicker{font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:var(--red)}
.dark .kicker{color:#ff7a7f}
.lead{font-size:12.5pt;color:var(--mut);line-height:1.5}
.dark .lead{color:#c9c9ce}
.foot{position:absolute;left:15mm;right:15mm;bottom:8mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#9a9aa0}
.dark .foot{color:#77777e}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:8pt;font-weight:700;padding:3px 10px;border-radius:99px}
.pill.red{background:var(--red);color:#fff}.pill.ok{background:#e4f3e6;color:var(--green)}.pill.part{background:#fff1cc;color:#8a6500}.pill.soon{background:#e9e9ec;color:#55565a}
.frame{border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(20,20,30,.22),0 2px 6px rgba(20,20,30,.12);border:1px solid #d9d9de}
.frame .bar{background:#ececef;height:20px;display:flex;align-items:center;gap:5px;padding:0 9px}
.frame .bar i{width:7px;height:7px;border-radius:50%;background:#c3c3c9;display:block}
.frame .bar span{margin-left:10px;font-size:6.5pt;color:#8b8b92;background:#fff;border-radius:99px;padding:1px 14px}
.frame img{display:block;width:100%}
.frame.crop2 img{width:100%;height:auto}
.frame.crop img{height:58mm;object-fit:cover;object-position:top}
.badge{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;flex:0 0 42px}
.mhead{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.mhead .sub{color:var(--mut);font-size:9.5pt;margin-top:1px}
ul.f{list-style:none;display:grid;gap:7px;margin:10px 0}
ul.f li{position:relative;padding-left:16px;font-size:10pt}
ul.f li:before{content:"";position:absolute;left:0;top:7px;width:7px;height:7px;border-radius:50%;background:var(--red)}
.tip{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-left:4px solid var(--red);border-radius:10px;padding:9px 12px;font-size:9.4pt;margin-top:10px}
.soft .tip{background:#fff}
.tip b{color:var(--red)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:13px 14px}
.dark .card{background:#26262a;border-color:#38383e}
.stat{font-size:30pt;font-weight:800;letter-spacing:-.02em;line-height:1}
.mut{color:var(--mut)}.small{font-size:8.6pt}
.step{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed var(--line)}
.step:last-child{border:0}
.step .n{width:30px;height:30px;border-radius:50%;background:var(--red);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 30px;font-size:11pt}
.step>div>b:first-child{display:block}
table.t{width:100%;border-collapse:collapse}.t td{padding:8px 10px;border-top:1px solid var(--line);vertical-align:top;font-size:9.6pt}.t td:first-child{font-weight:700;width:30%}
.chk{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:10px;font-size:9.6pt}
.chk:before{content:"";width:15px;height:15px;border:2px solid var(--red);border-radius:5px;flex:0 0 15px;margin-top:2px}
.tl{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
.tl .col{border-radius:16px;padding:14px;background:#fff;border:1px solid var(--line)}
.tl .col h4{font-size:11pt;margin-bottom:2px}
.tl .item{display:flex;gap:8px;margin-top:9px;font-size:9pt}.tl .item .d{width:26px;height:26px;border-radius:8px;background:var(--soft);display:flex;align-items:center;justify-content:center;flex:0 0 26px;color:var(--red)}
'''

pages=[]
def page(inner, cls='', n=None, dark=False):
    foot='' if n is None else f'<div class="foot"><span>Poliplast CRM · Guía beta del equipo</span><span>{n}</span></div>'
    pages.append(f'<section class="page {cls}">{inner}{foot}</section>')

# 1 PORTADA
page(f'''
<div style="position:absolute;right:-60mm;top:-40mm;width:190mm;height:190mm;border-radius:50%;background:radial-gradient(circle at 30% 30%,#ff4a50,#ed1c24 55%,#9f0f15)"></div>
<div style="position:absolute;left:-50mm;bottom:-70mm;width:150mm;height:150mm;border-radius:50%;background:#26262a"></div>
<img src="{logo}" style="position:relative;width:62mm;display:block;margin-top:2mm">
<div style="position:relative;margin-top:44mm"><span class="pill red">VERSIÓN BETA</span>
<h1 style="margin-top:10px">Poliplast<br>CRM</h1>
<p class="lead" style="margin-top:14px;max-width:100mm;font-size:13.5pt">La primera versión del sistema que estamos construyendo entre todos. Esta guía te lleva por cada módulo, te cuenta qué conecta con qué y qué viene después.</p></div>
<div style="position:absolute;left:15mm;right:15mm;bottom:22mm">
 <div style="transform:rotate(-2deg);width:150mm;margin-left:32mm">{frame('01-inicio','poli-crm.vercel.app')}</div>
</div>
<div class="foot"><span>Grupo Poliplast · octubre de 2026</span><span>poli-crm.vercel.app</span></div>
''','dark')

# 2 BIENVENIDA
page(f'''
<span class="kicker">Bienvenida</span><h2 style="margin-top:6px">Esto recién empieza.<br>Y lo hacemos con vos.</h2>
<p class="lead" style="margin-top:12px;max-width:150mm">Armamos el CRM pensando en cómo trabaja el equipo de Poliplast: Resinplast, Imperpur, RAPYP, Penosil, máquinas, repuestos, e-commerce. Es una <b style="color:var(--ink)">beta</b>: una primera versión, con mucho por recorrer. Necesitamos que la uses, la rompas y nos digas qué sacar, qué agregar y qué cambiar.</p>
<div class="grid3" style="margin-top:20px">
 <div class="card"><div class="stat" style="color:var(--red)">13</div><b>módulos</b><p class="mut small">de Inicio a Datos, en cinco grupos.</p></div>
 <div class="card"><div class="stat" style="color:var(--red)">8</div><b>pestañas en Academia</b><p class="mut small">método, objeciones, competencia, equipo y más.</p></div>
 <div class="card"><div class="stat" style="color:var(--red)">0</div><b>mensajes enviados solos</b><p class="mut small">el CRM sugiere; el contacto siempre es tuyo.</p></div>
</div>
<div style="margin-top:20px" class="grid2">
 <div class="card"><div class="mhead" style="margin:0 0 6px"><div class="badge" style="background:var(--red)">{ic('spark')}</div><h3>Qué vas a encontrar</h3></div>
  <ul class="f"><li>Tu día ordenado: tareas, calendario y cierre del día.</li><li>Prospección con borradores de mensajes.</li><li>Una Academia que sabe de productos, clientes, objeciones y competencia.</li><li>Un directorio de empresas y un mapa, compartidos.</li></ul></div>
 <div class="card"><div class="mhead" style="margin:0 0 6px"><div class="badge" style="background:var(--ink)">{ic('chat')}</div><h3>Qué te pedimos</h3></div>
  <ul class="f"><li>Probarlo en tu trabajo real, no solo mirarlo.</li><li>Anotar lo que te frena, te confunde o te falta.</li><li>Contarnos cómo trabajás de verdad: eso alimenta la Academia.</li><li>Proponer ideas, por locas que parezcan.</li></ul></div>
</div>
<div class="tip" style="margin-top:20px"><div><b>Beta:</b> puede haber errores, pantallas vacías o cosas a medias. Es normal y es justo lo que queremos encontrar juntos.</div></div>
<div style="margin-top:22px;display:grid;grid-template-columns:1.4fr 1fr;gap:12px;align-items:end"><div>{frame('15-academia-buscar','Academia comercial · Buscar')}</div><div>{frame('26-modo-oscuro','Modo oscuro')}</div></div>
''', n=2)

# 3 REGISTRO
steps=[('Abrí el sitio','Entrá a <b>poli-crm.vercel.app</b> desde la compu o el celu.'),('Crear cuenta nueva','Tocá <b>"Crear cuenta nueva"</b>.'),('Tu mail de la empresa','Usá <b>tunombre@grupopoliplast.com.ar</b>. Con otro dominio no deja crear la cuenta.'),('Elegí tu contraseña','Mínimo 6 caracteres; mejor 10 o más y distinta a las que usás en otros lados. Tocá <b>"Crear cuenta"</b>.'),('Confirmá tu mail','Te llega un correo: abrilo y tocá el enlace. Si no aparece, mirá en spam y avisale a Felipe.'),('Ingresá','Volvé al sitio, tocá <b>"Ingresar"</b> con tu mail y contraseña.'),('Primeros pasos','En <b>Perfil</b> poné tu nombre y metas. En <b>Más → Datos</b> tocá <b>"Traer empresas del equipo"</b>.')]
st=''.join(f'<div class="step"><div class="n">{i+1}</div><div><b>{e(t)}</b><span class="mut">{d}</span></div></div>' for i,(t,d) in enumerate(steps))
page(f'''
<span class="kicker">Paso a paso</span><h2 style="margin-top:6px">Registrate en 3 minutos</h2>
<div class="grid2" style="margin-top:14px;grid-template-columns:1.25fr 1fr;gap:18px;align-items:start">
 <div class="card" style="padding:6px 16px">{st}</div>
 <div>
  <div class="card" style="background:var(--ink);color:#fff;border:0"><div class="kicker" style="color:#ff7a7f">Tip</div><h3 style="margin:4px 0 6px">Llevalo en el celu</h3><p class="small" style="color:#cfcfd4">Chrome: menú ⋮ → <b>Agregar a pantalla de inicio</b>.<br>iPhone (Safari): Compartir → <b>Agregar a inicio</b>.<br>Queda como una app.</p></div>
  <div class="card" style="margin-top:10px"><h3>¿Te olvidaste la clave?</h3><p class="mut small" style="margin-top:4px">Tocá <b>"Olvidé mi contraseña"</b> y te llega un enlace. También podés usar <b>"Prefiero un enlace por correo"</b> para entrar sin contraseña.</p></div>
  <div class="card" style="margin-top:10px;border-left:4px solid var(--amber)"><h3>Si el mail no llega</h3><p class="mut small" style="margin-top:4px">Revisá spam. Si somos varios registrándonos a la vez, puede demorar: avisale a Felipe y lo resolvemos.</p></div>
 </div>
</div>
<div style="margin-top:16px">{frame('24-datos','Más → Datos · Directorio del equipo','crop')}</div>
''', n=3)

# 4 PRIVADO vs COMPARTIDO
donut='''<svg viewBox="0 0 120 120" width="150" height="150"><circle cx="60" cy="60" r="44" fill="none" stroke="#e4f3e6" stroke-width="18"/><circle cx="60" cy="60" r="44" fill="none" stroke="#2e7d32" stroke-width="18" stroke-dasharray="152 276" transform="rotate(-90 60 60)" stroke-linecap="round"/><circle cx="60" cy="60" r="44" fill="none" stroke="#ed1c24" stroke-width="18" stroke-dasharray="108 276" stroke-dashoffset="-160" transform="rotate(-90 60 60)" stroke-linecap="round"/><text x="60" y="58" text-anchor="middle" font-size="9" font-weight="700" fill="#1c1c1f">Cada uno</text><text x="60" y="70" text-anchor="middle" font-size="9" fill="#6b6c70">su espacio</text></svg>'''
page(f'''
<span class="kicker">Privacidad</span><h2 style="margin-top:6px">Lo de todos y lo tuyo</h2>
<p class="lead" style="margin-top:8px;max-width:150mm">Cada persona tiene su propio espacio de trabajo. Lo que sirve a todo el equipo se comparte; lo personal, nunca.</p>
<div style="display:flex;gap:18px;align-items:center;margin-top:12px"><div>{donut}</div>
<div style="flex:1"><div class="pill ok">COMPARTIDO</div> <span class="mut small">sirve para todos</span><br><div class="pill part" style="margin-top:8px;background:#fde4e5;color:#b3141b">PRIVADO</div> <span class="mut small">solo tuyo, nadie más lo ve</span></div></div>
<div class="grid2" style="margin-top:12px">
 <div class="card" style="border-top:5px solid var(--green)"><div class="mhead" style="margin-bottom:4px"><div class="badge" style="background:var(--green)">{ic('share')}</div><h3>Es de todos</h3></div>
 <ul class="f"><li><b>Academia comercial</b> completa: método, objeciones, perfiles, competencia, equipo y buscador.</li><li><b>Base técnica</b> y catálogo con sus fichas.</li><li><b>Competidores</b>: cualquiera puede cargar; solo Felipe borra.</li><li><b>Directorio de empresas</b>: lo publica Felipe y cada uno lo trae cuando quiere.</li><li><b>Mapa</b> de esas empresas.</li></ul></div>
 <div class="card" style="border-top:5px solid var(--red)"><div class="mhead" style="margin-bottom:4px"><div class="badge" style="background:var(--red)">{ic('lock')}</div><h3>Es solo tuyo</h3></div>
 <ul class="f"><li><b>Ventas</b>, objetivos y números.</li><li><b>Comisiones.</b></li><li><b>Tus tareas</b>, plan de hoy y cierre del día.</li><li><b>Tus notas</b>, etapas y conversaciones.</li><li><b>Tu historial</b> y cuentas activas.</li><li><b>Tus cotizaciones.</b></li></ul></div>
</div>
<h3 style="margin-top:16px">Quién puede hacer qué</h3>
<div class="card" style="padding:0;overflow:hidden;margin-top:8px"><table class="t" style="font-size:9.4pt"><tr style="background:var(--ink);color:#fff"><td style="border:0">&nbsp;</td><td style="border:0"><b>Lo tuyo (privado)</b></td><td style="border:0"><b>Lo de todos (compartido)</b></td></tr>
<tr><td>Cargar y agregar</td><td>Vos, libremente</td><td>Cualquiera del equipo: competidores, empresas, fichas…</td></tr>
<tr><td>Editar</td><td>Solo vos</td><td>Cualquiera del equipo</td></tr>
<tr><td>Borrar</td><td>Vos: afecta solo a tu cuenta</td><td><b>Solo Felipe</b>, para que nada del equipo se pierda por error</td></tr></table></div>
<div class="tip" style="margin-top:12px"><div><b>Importante:</b> el directorio compartido trae solo nombre, rubro, ubicación y contactos de cada empresa. Nunca notas, compras, etapas ni números comerciales.</div></div>
''', n=4, cls='soft')

# 5 MAPA DEL CRM
groups=[('Hoy','#ed1c24',[('Inicio','home'),('Por revisar','inbox'),('Tareas','check')]),('Ventas','#2a2a2e',[('Cuentas activas','target'),('Ventas','receipt'),('Prospección','search'),('Historial','chat')]),('Cartera','#3b6d9b',[('Empresas y contactos','building'),('Mapa','pin')]),('Aprender','#2e7d32',[('Academia comercial','cap'),('Base técnica','doc')]),('Más','#8a6500',[('Perfil','user'),('Datos','db')])]
gh=''
for name,color,items in groups:
    pills=''.join(f'<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:7px 10px;margin-top:6px;font-size:9.4pt;font-weight:600"><span style="color:{color}">{ic(ic_,18)}</span>{e(t)}</div>' for t,ic_ in items)
    gh+=f'<div style="flex:1;min-width:0"><div style="background:{color};color:#fff;border-radius:12px;padding:9px 12px;font-weight:800;font-size:11pt">{name}</div>{pills}</div>'
page(f'''
<span class="kicker">El mapa</span><h2 style="margin-top:6px">Todo el CRM de un vistazo</h2>
<p class="lead" style="margin-top:8px;max-width:150mm">El menú de la izquierda (en el celu, los íconos de arriba) tiene cinco grupos. Tocá un grupo para abrirlo.</p>
<div style="display:flex;gap:9px;margin-top:20px;align-items:flex-start">{gh}</div>
<div class="card" style="margin-top:24px"><h3>Siempre a mano, arriba de cada pantalla</h3>
<div class="grid3" style="margin-top:10px">
 <div><div class="badge" style="background:var(--ink);margin-bottom:6px">{ic('search')}</div><b>Búsqueda global</b><p class="mut small">Ctrl+K o la lupa: empresas, tareas y prospectos.</p></div>
 <div><div class="badge" style="background:var(--red);margin-bottom:6px">{ic('cal')}</div><b>Hora y clima</b><p class="mut small">Hora de Argentina en vivo y clima de Mar del Plata y Berazategui. "¿Dónde estás?" suma tu ciudad.</p></div>
 <div><div class="badge" style="background:#8a6500;margin-bottom:6px">{ic('moon')}</div><b>Tema</b><p class="mut small">Automático, claro u oscuro. Un toque y cambia.</p></div>
</div></div>
<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end">
 <div>{frame('26-modo-oscuro','Modo oscuro')}</div><div>{frame('01-inicio','Modo claro')}</div></div>
''', n=5)

# 6 UN DÍA CON EL CRM
flow=[('08:30','Arrancá','Inicio y Por revisar: qué entró, qué venció.','home','#ed1c24'),('09:00','Prospectá','Prospección: abrí un prospecto y copiá el borrador.','search','#2a2a2e'),('11:00','Seguí cuentas','Cuentas activas y Tareas: respondé y programá el próximo paso.','target','#3b6d9b'),('15:00','Aprendé y preparate','Academia: objeción, competencia o ficha técnica antes de llamar.','cap','#2e7d32'),('18:00','Cerrá el día','Cierre del día: qué salió bien, qué quedó y qué se posterga.','moon','#8a6500')]
fl=''
for i,(h,t,d,icn,col) in enumerate(flow):
    fl+=f'<div style="display:flex;gap:14px;align-items:stretch"><div style="display:flex;flex-direction:column;align-items:center"><div class="badge" style="background:{col};width:46px;height:46px;flex-basis:46px;border-radius:50%">{ic(icn,22)}</div>{"<div style=\"flex:1;width:3px;background:repeating-linear-gradient(#d8d8dd 0 6px,transparent 6px 12px);margin:4px 0\"></div>" if i<len(flow)-1 else ""}</div><div class="card" style="flex:1;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>{t}</h3><span class="pill soon">{h}</span></div><p class="mut" style="margin-top:3px;font-size:9.6pt">{d}</p></div></div>'
page(f'''
<span class="kicker">Cómo se usa</span><h2 style="margin-top:6px">Un día con el CRM</h2>
<p class="lead" style="margin-top:8px;max-width:150mm">Un recorrido de ejemplo: no es obligatorio, es una forma de ordenar el día para que nada se escape.</p>
<div style="margin-top:20px">{fl}</div>
<div class="grid3" style="margin-top:6px">
 <div class="card"><div class="kicker">Cada mañana</div><b>5 minutos</b><p class="mut small">Inicio, Por revisar y tu Plan de hoy.</p></div>
 <div class="card"><div class="kicker">Cada tarde</div><b>5 minutos</b><p class="mut small">Cierre del día: tildá, posterga lo que no llegaste.</p></div>
 <div class="card"><div class="kicker">Cada viernes</div><b>15 minutos</b><p class="mut small">Mirá tus metas de la semana y planificá la próxima en el Calendario.</p></div></div>
<div style="margin-top:14px;width:130mm;margin-left:auto">{frame('05-calendario','Tareas · Calendario','crop')}</div>
''', n=6)


def map_art():
    pins=[(60,70,'#ed1c24'),(120,110,'#ed1c24'),(175,60,'#2a2a2e'),(210,140,'#2a2a2e'),(90,160,'#3b6d9b'),(150,175,'#3b6d9b'),(235,85,'#ed1c24'),(40,130,'#3b6d9b'),(190,105,'#ed1c24'),(110,50,'#2a2a2e')]
    dots=''.join(f'<circle cx="{x}" cy="{y}" r="9" fill="{c}" opacity=".16"/><circle cx="{x}" cy="{y}" r="4.5" fill="{c}"/>' for x,y,c in pins)
    grid=''.join(f'<path d="M{i*30} 0V200M0 {i*25}H280" stroke="#e1e6ea" stroke-width="1"/>' for i in range(0,10))
    return f'''<div class="frame"><div class="bar"><i></i><i></i><i></i><span>poli-crm.vercel.app · Mapa (ilustración)</span></div><svg viewBox="0 0 280 200" width="100%" style="display:block;background:#f1f5f8"><rect width="280" height="200" fill="#f1f5f8"/>{grid}<path d="M30 40C60 15 120 25 160 18C205 12 250 40 255 85C260 130 215 175 160 182C105 190 45 170 28 125C18 95 20 62 30 40Z" fill="#e9eef2" stroke="#d3dbe1" stroke-width="2"/>{dots}</svg><div style="display:flex;gap:14px;padding:7px 10px;font-size:7pt;color:#55565a;background:#fff"><span><b style="color:#ed1c24">●</b> Aplicadores (RAPYP)</span><span><b style="color:#2a2a2e">●</b> Ventas</span><span><b style="color:#3b6d9b">●</b> Prospectos</span></div></div>'''

# MÓDULOS
def mblock(color, icn, title, sub, feats, tip, shot_id, url):
    fs=''.join(f'<li>{f}</li>' for f in feats)
    return f'''<div style="height:123mm;margin-bottom:6mm;overflow:hidden">
<div class="mhead"><div class="badge" style="background:{color};width:46px;height:46px;flex-basis:46px">{ic(icn,23)}</div><div><span class="kicker" style="color:{color}">Módulo</span><h2 style="font-size:19pt">{title}</h2></div></div>
<p class="lead" style="font-size:10.8pt">{sub}</p>
<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:14px;margin-top:10px;align-items:start">
 <div><ul class="f" style="margin-top:0;font-size:9.6pt">{fs}</ul><div class="tip" style="font-size:9pt"><div><b>Probá esto:</b> {tip}</div></div></div>
 <div>{map_art() if shot_id=='MAP' else frame(shot_id,url,'crop2')}</div>
</div></div>'''
M=[
('#ed1c24','home','Inicio','Tu panel del día: lo urgente, tus metas y los radares que te avisan antes de que algo se enfríe.',['<b>Qué hacer hoy:</b> tareas vencidas y de hoy, y conversaciones calientes sin responder.','<b>Plan de hoy:</b> una lista tuya para anotar y tildar.','<b>Metas de la semana:</b> contactos, efectivos y propuestas contra tu objetivo.','<b>Radares:</b> clientes para recomprar, cotizaciones frías o vencidas y clientes sin contacto.'],'agregá tres cosas a tu Plan de hoy y tildá una.','01-inicio','poli-crm.vercel.app · Inicio'),
('#2a2a2e','inbox','Por revisar','Los mensajes de WhatsApp que entran a tu número, para clasificar y registrar en un toque.',['Cada mensaje se puede <b>registrar como conversación</b>, convertir en tarea o descartar.','Muestra solo lo nuevo: lo resuelto desaparece de acá y queda guardado donde corresponde.','Hoy solo muestra mensajes si <b>tu número de WhatsApp está conectado</b> al CRM; si lo ves vacío es lo esperado en la beta.'],'mirá los filtros por familia y prioridad cuando haya mensajes.','02-por-revisar','poli-crm.vercel.app · Por revisar'),
('#ed1c24','check','Tareas','Todo lo que tenés que hacer, con fecha, y un calendario que se puede llevar a Google.',['<b>Tareas:</b> crear, completar y buscar con empresa, fecha y prioridad. Exportables a CSV.','<b>Cierre del día:</b> qué salió bien, qué quedó, qué se postergó y qué viene. Cada pendiente se pasa al próximo día hábil con un toque.','<b>Calendario:</b> tus tareas y eventos con hora (visitas, reuniones, llamadas) en un mes.','<b>Google Calendar:</b> exportá a un archivo .ics o abrí una tarea directo en Google Calendar.'],'cargá un evento con hora y exportalo a tu Google Calendar.','04-rutina','poli-crm.vercel.app · Tareas · Cierre del día'),
('#3b6d9b','cal','Calendario','Tus tareas y eventos en un mes, con exportación a Google Calendar.',['Creá eventos con <b>hora de inicio y fin</b>, lugar y empresa.','El botón <b>"Exportar a Google Calendar"</b> genera un archivo que se importa en Google Calendar.','Cada tarea tiene su enlace <b>"Abrir en Google Calendar"</b>.','La exportación es en un solo sentido: del CRM a Google.'],'importá el archivo en tu Google Calendar y mirá cómo aparecen tus visitas.','05-calendario','poli-crm.vercel.app · Tareas · Calendario'),
('#2a2a2e','target','Cuentas activas','Las empresas con las que estás trabajando, ordenadas por etapa del proceso comercial.',['Un tablero por etapas: Preparación, Apertura, Diagnóstico, Calificación, Recomendación y más.','Arrastrá una cuenta a otra columna a medida que avanza.','Solo aparecen las cuentas que vos decidís trabajar.'],'sumá una cuenta y movela de etapa.','06-cuentas','poli-crm.vercel.app · Cuentas activas'),
('#2a2a2e','receipt','Ventas','Tu resultado comercial. Es privado: nadie más lo ve.',['<b>Objetivos</b> que vos elegís (cantidad, neto o comisión).','<b>Ventas realizadas:</b> registrar una venta, importar histórico o subir un PDF de factura.','<b>Unidades de negocio:</b> CUIT, razón social, comisión y puntos de venta.'],'definí un objetivo del mes y registrá una venta de prueba.','07-ventas','poli-crm.vercel.app · Ventas'),
('#2a2a2e','search','Prospección','Buscar empresas nuevas para venderles, con ayuda de la IA que ya usás. Tres pestañas.',['<b>Prospectos:</b> tu cola de trabajo, con borrador de primer mensaje para copiar. Nunca se envía solo.','<b>Buscar con IA:</b> armás un pedido (familia, zona, cantidad), lo pegás en tu IA y después pegás la tabla que devuelve: el CRM la revisa e importa.','<b>Competencia:</b> quién compite en cada familia; podés cargar un competidor nuevo.'],'abrí "Buscar con IA" y armá un pedido para tu familia.','08-prospeccion','poli-crm.vercel.app · Prospección'),
('#2a2a2e','chat','Historial','Una conversación por cliente, con todo lo registrado.',['Mirá el recorrido de cada empresa y retomá donde quedó.','Filtros por familia, temperatura y fechas.','Se alimenta con lo que registrás desde Por revisar y desde "Registrar conversación".'],'registrá una conversación y buscala acá.','11-historial','poli-crm.vercel.app · Historial'),
('#3b6d9b','building','Empresas y contactos','Todas las empresas y las personas de cada una, en un solo lugar. Dos pestañas.',['<b>Empresas:</b> ficha completa, búsqueda, importación CSV y detección de duplicados.','<b>Personas de contacto:</b> una empresa puede tener varias; al tocar una persona abre la ficha de su empresa.','Podés <b>traer las empresas del equipo</b> desde Más → Datos.'],'traé las empresas del equipo y buscá una con Ctrl+K.','12-empresas','poli-crm.vercel.app · Empresas y contactos'),
('#3b6d9b','pin','Mapa','Dónde está cada cliente y cada prospecto.',['Tres vistas: <b>aplicadores (RAPYP)</b>, <b>ventas</b> y <b>prospectos</b>.','Las empresas sin ubicación aparecen en <b>"Pendientes de ubicación"</b> para completarlas.','El mapa se ve completo en la versión en línea.'],'completá la ubicación de una empresa pendiente.','MAP','poli-crm.vercel.app · Mapa'),
('#2e7d32','cap','Academia comercial','Todo lo que sabe y enseña el CRM. Es para todos y crece con lo que nos cuenten.',['<b>Buscar:</b> una sola búsqueda en productos, fichas, clientes, vendedores, objeciones y competencia.','<b>Método, Objeciones y Perfiles:</b> el proceso E-C-E-R-A y cómo responder a cada situación.','<b>Competencia:</b> cómo hablar frente a cada competidor.','<b>Equipo:</b> cómo trabaja cada vendedor y cómo lo asiste el CRM (borrador: ¡corregí tu ficha!).','<b>Biblioteca y práctica</b> y <b>Evaluar conversaciones:</b> respuestas tipo y puntaje de una conversación.'],'buscá una objeción real que te haya pasado esta semana.','15-academia-buscar','poli-crm.vercel.app · Academia comercial'),
('#2e7d32','doc','Base técnica','Las fichas técnicas y el catálogo, listos para consultar.',['<b>"Preguntale al catálogo":</b> escribís una necesidad y devuelve las fichas que aplican.','Arma un texto con los extractos reales de las fichas, listo para pegar en tu IA.','Solo cita fichas vigentes y validadas.'],'preguntá por un producto para aislar una casilla rodante.','22-base-tecnica','poli-crm.vercel.app · Base técnica'),
('#8a6500','user','Perfil','Tu cuenta y tu semana.',['Tu nombre, tus <b>metas semanales</b> y el cambio de contraseña.','Las metas alimentan las tarjetas de Inicio.'],'poné tus metas de la semana.','23-perfil','poli-crm.vercel.app · Perfil'),
('#8a6500','db','Datos','Importar, exportar y cuidar tu información.',['<b>Directorio del equipo:</b> "Traer empresas del equipo" suma las que publicó Felipe, sin pisar las tuyas.','<b>Exportar e importar</b> empresas, ventas y tareas en CSV.','<b>Respaldo:</b> descargá todo en un archivo JSON y restauralo cuando quieras.'],'descargá tu respaldo en JSON.','24-datos','poli-crm.vercel.app · Datos'),
]
pn=7
for i in range(0,len(M),2):
    blocks=''.join(mblock(*args) for args in M[i:i+2])
    page(blocks, n=pn); pn+=1

# CONEXIONES
def conn(icn,col,title,status,cls,desc,detail):
    return f'<div class="card" style="display:flex;gap:12px"><div class="badge" style="background:{col}">{ic(icn,22)}</div><div style="flex:1"><div style="display:flex;justify-content:space-between;gap:8px"><h3>{title}</h3><span class="pill {cls}">{status}</span></div><p style="margin-top:3px;font-size:9.6pt">{desc}</p><p class="mut small" style="margin-top:3px">{detail}</p></div></div>'
page(f'''
<span class="kicker">Conexiones</span><h2 style="margin-top:6px">Con qué se conecta el CRM</h2>
<p class="lead" style="margin-top:8px;max-width:155mm">Qué funciona hoy, qué es parcial y qué viene. Sin letra chica.</p>
<div style="display:grid;gap:9px;margin-top:14px">
{conn('cal','#3b6d9b','Google Calendar','FUNCIONA HOY','ok','Exportás tareas, eventos con hora y tu rutina a un archivo .ics y lo importás en Google Calendar; cada tarea tiene "Abrir en Google Calendar".','Es en un solo sentido (CRM → Google). Que cada uno sincronice su propio calendario de forma automática es una mejora futura.')}
{conn('list','#2a2a2e','Trello','PARCIAL','part','El plan de Trello del 16/10 al 31/12 está cargado como tareas en la cuenta de Felipe, con enlace a cada tarjeta.','Hoy solo lo usa Felipe. Que cada uno conecte <b>su propio tablero</b> es una mejora prevista: no todos usan el mismo.')}
{conn('chat','#2e7d32','WhatsApp','FUNCIONA HOY (RECIBE)','part','Los mensajes entran a "Por revisar" y se registran en el Historial. El CRM <b>nunca envía</b> mensajes.','Falta vincular los números del equipo y estabilizar la entrega con Meta (hay un caso de soporte abierto).')}
{conn('share','#ed1c24','Instagram y Facebook','PRÓXIMAMENTE','soon','@Resinplast, @grupopoliplast, @imperpur y @rapyp entrando al mismo lugar.','Requiere cuentas profesionales y la aprobación de la app en Meta.')}
{conn('db','#8a6500','Excel y CSV','FUNCIONA HOY','ok','Importás y exportás empresas, ventas y tareas; descargás un respaldo completo en JSON.','Sirve para migrar listas existentes y como copia de seguridad.')}
{conn('spark','#2a2a2e','Tu IA de siempre','FUNCIONA HOY','ok','Prospección, Base técnica y Academia arman el texto con datos reales para que lo pegues en Claude, ChatGPT o Gemini, y después importás el resultado.','El CRM no tiene IA propia todavía: usás la que ya tenés, sin costo extra.')}
{conn('receipt','#3b6d9b','Contabilium','PRÓXIMAMENTE','soon','Traer presupuestos y facturas automáticamente para el seguimiento de cotizaciones.','Hoy el CRM tiene radares de cotizaciones frías y vencidas con lo que cargás.')}
</div>
''', n=pn, cls='soft'); pn+=1

# ATAJOS + QUÉ PROBAR
CH=['Crear tu cuenta con tu mail y entrar (también desde el celu).','Poner tu nombre y tus metas en Perfil.','Traer las empresas del equipo y buscar una con Ctrl+K.','Crear una tarea con fecha, completar otra y mirar el Cierre del día.','Cargar un evento con hora y exportarlo a Google Calendar.','Buscar una empresa y mirar sus personas de contacto.','Registrar una conversación y verla en Historial.','Abrir un prospecto y copiar el borrador de mensaje.','En Academia → Buscar, buscar una objeción o producto real.','Corregir tu ficha en Academia → Equipo y contarnos cómo trabajás.','Cambiar el tema y mirar el clima de tu ciudad.','Usar el CRM un día entero y anotar lo que te frenó o te faltó.']
ck=''.join(f'<div class="chk">{e(c)}</div>' for c in CH)
page(f'''
<span class="kicker">Manos a la obra</span><h2 style="margin-top:6px">Doce cosas para probar</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">{ck}</div>
<h3 style="margin-top:20px">Atajos que te ahorran tiempo</h3>
<div class="grid3" style="margin-top:8px">
<div class="card" style="text-align:center"><div class="stat" style="font-size:16pt">Ctrl + K</div><p class="mut small">Búsqueda global</p></div>
<div class="card" style="text-align:center"><div class="stat" style="font-size:16pt">/</div><p class="mut small">Buscar en la pantalla</p></div>
<div class="card" style="text-align:center"><div class="stat" style="font-size:16pt">n</div><p class="mut small">Nueva tarea</p></div></div>
''', n=pn); pn+=1

# FEEDBACK
page(f'''
<span class="kicker">Ayudanos a mejorarlo</span><h2 style="margin-top:6px">Contanos todo,<br>lo bueno y lo malo</h2>
<p class="lead" style="margin-top:10px;max-width:150mm">Mandáselo a Felipe por WhatsApp o mail. No hace falta que sea un error: ideas, cosas que sobran, cosas que faltan y cómo trabajás de verdad nos sirven igual.</p>
<div class="grid2" style="margin-top:18px">
 <div class="card"><div class="badge" style="background:var(--red);margin-bottom:8px">{ic('pin')}</div><h3>1. Dónde estabas</h3><p class="mut small">La pantalla o el módulo.</p></div>
 <div class="card"><div class="badge" style="background:var(--ink);margin-bottom:8px">{ic('bolt')}</div><h3>2. Qué hiciste</h3><p class="mut small">Los pasos, con tus palabras.</p></div>
 <div class="card"><div class="badge" style="background:var(--green);margin-bottom:8px">{ic('check')}</div><h3>3. Qué esperabas</h3><p class="mut small">Qué debería haber pasado.</p></div>
 <div class="card"><div class="badge" style="background:var(--amber);margin-bottom:8px">{ic('doc')}</div><h3>4. Qué pasó</h3><p class="mut small">Y una captura de pantalla, que ayuda muchísimo.</p></div>
</div>
<div class="card" style="margin-top:18px;background:var(--ink);color:#fff;border:0"><div class="kicker" style="color:#ff7a7f">Lo que más nos sirve</div><h3 style="margin:4px 0 6px;font-size:14pt">Contanos cómo trabajás vos.</h3><p style="color:#cfcfd4;font-size:10pt">Qué consultas te llegan, dónde se te escapan ventas, qué hacés cada mañana. Eso alimenta la Academia y la asistencia que el CRM te va a dar a medida.</p></div>
''', n=pn, cls='soft'); pn+=1

# FUTURO
def it(icn,t,d): return f'<div class="item"><div class="d">{ic(icn,15)}</div><div><b>{t}</b><br><span class="mut">{d}</span></div></div>'
page(f'''
<span class="kicker">Hacia dónde vamos</span><h2 style="margin-top:6px">Futuras mejoras</h2>
<p class="lead" style="margin-top:8px;max-width:155mm">Esta primera versión es el comienzo. Mucho falta, y queremos recorrerlo con ustedes. Son planes e ideas, sin fecha comprometida.</p>
<div class="tl">
 <div class="col" style="border-top:5px solid var(--green)"><h4>Ahora · beta</h4><span class="pill ok">EN MARCHA</span>
  {it('check','Ajustes con tu feedback','lo que encuentren, lo corregimos.')}
  {it('cap','Fichas y Academia','cada uno completa su ficha; sumar texto completo de las fichas técnicas.')}
  {it('list','Respuestas por marca','textos reales de Resinplast, Imperpur y máquinas.')}
  {it('building','Directorio vivo','que lo compartido se mantenga al día.')}</div>
 <div class="col" style="border-top:5px solid var(--amber)"><h4>Próximo</h4><span class="pill part">A DEFINIR</span>
  {it('share','Vincular con Meta','WhatsApp, Instagram y Facebook de las cuatro marcas.')}
  {it('chat','WhatsApp central','un número que reciba y derive a cada comercial.')}
  {it('receipt','Contabilium','presupuestos y facturas para el seguimiento.')}
  {it('cal','Tu tablero y tu calendario','que cada uno conecte los suyos.')}</div>
 <div class="col" style="border-top:5px solid var(--red)"><h4>Más adelante</h4><span class="pill soon">IDEAS</span>
  {it('spark','Agente','un asistente que ordene, sugiera y prepare respuestas.')}
  {it('bolt','IA en el CRM','borradores de respuesta y de pedidos, aprendiendo de cada comercial.')}
  {it('doc','Cotizador integrado','el cotizador de Poliplast adentro del CRM.')}
  {it('target','Prospección asistida','automatizar la búsqueda, siempre con envío manual.')}</div>
</div>
<div class="card" style="margin-top:16px"><h3>¿Qué más te gustaría?</h3><p class="mut small" style="margin-top:3px">Reportes por comercial, avisos en el celu, comisiones, integraciones con otras herramientas… Lo que propongas entra a la lista. La mejor idea puede ser la tuya.</p></div>
''', n=pn); pn+=1

# CIERRE
page(f'''
<div style="position:absolute;left:-40mm;top:-30mm;width:150mm;height:150mm;border-radius:50%;background:radial-gradient(circle at 30% 30%,#ff4a50,#ed1c24 55%,#9f0f15)"></div>
<div style="position:relative;margin-top:92mm;text-align:center"><img src="{logo}" style="width:60mm"><h1 style="font-size:34pt;margin-top:18px">Gracias por<br>sumarte</h1>
<p class="lead" style="margin:14px auto 0;max-width:120mm;font-size:12.5pt">El mejor CRM es el que usa el equipo. Probalo, contanos y lo hacemos juntos.</p>
<div style="margin-top:22px"><span class="pill red" style="font-size:11pt;padding:7px 18px">poli-crm.vercel.app</span></div></div>
<div class="foot"><span>Grupo Poliplast · octubre de 2026</span><span>Versión beta</span></div>
''','dark')

doc=f'<!doctype html><html lang="es"><meta charset="utf-8"><style>{CSS}</style><body>'+''.join(pages)+'</body></html>'
open('/tmp/claude-0/g2/guia2.html','w').write(doc)
print(len(pages),'páginas')
