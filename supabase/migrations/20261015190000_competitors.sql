-- Competencia: fichas compartidas (solo lectura para el equipo). Las carga/actualiza Claude
-- con datos verificados en la web; cada dato lleva su fuente.
create table if not exists public.competitors (
  id text primary key,
  name text not null,
  summary text not null default '',
  products text[] not null default '{}',
  location text not null default '',
  website text not null default '',
  channels text not null default '',
  sources jsonb not null default '[]',
  caveats text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.competitors enable row level security;
revoke all on public.competitors from anon;
grant select on public.competitors to authenticated;
create policy competitors_read on public.competitors for select to authenticated using (true);

insert into public.competitors (id, name, summary, products, location, website, channels, sources, caveats) values
('argenpur','Argenpur S.A.','Fabricante argentino de poliuretano y poliisocianurato para aislaciones térmicas. Hace espuma para carrocerías de transporte refrigerado, materiales compuestos, piezas moldeadas y aislación de cañerías y equipos; también aplica por proyección e inyecta.',
 array['Bloques de espuma','Planchas de 5 a 600 mm de espesor','Puertas y paneles inyectados','Aplicación por proyección e inyección'],
 'Av. Gaona 3175, Paso del Rey (Buenos Aires)','https://www.argenpur.com.ar/','Venta directa a industria. Tel. 0237 468-0000.',
 '[{"t":"Sitio oficial","u":"https://www.argenpur.com.ar/"},{"t":"Catálogo de productos","u":"http://www.argenpur.com.ar/productos.html"},{"t":"Directorio Cylex","u":"https://www.cylex.com.ar/paso-del-rey/argenpur-sa-11329819.html"}]',
 'Las direcciones difieren entre registros (planta en Paso del Rey, domicilio fiscal en Moreno). Sin precios ni volumen verificados.'),
('sulfibra','Sulfibra (Brasil / Sulfibra Argentina)','Fabricante brasileño de laminados de fibra de vidrio y paneles de aislación térmica, con base en Iomerê (Santa Catarina). Desde 2006 abastece carroceros de camiones y exporta a Latinoamérica desde 2013. Tiene filial en Argentina.',
 array['Laminados PRFV','Paneles rígidos de poliuretano','Paneles sándwich','Herrajes metálicos'],
 'Iomerê, Santa Catarina (Brasil); filial Sulfibra Argentina','https://sulfibraargentina.com.ar/','Venta a carroceros e industria; exporta a Colombia, Chile, Perú y Argentina.',
 '[{"t":"Sulfibra Argentina","u":"https://sulfibraargentina.com.ar/"},{"t":"Quiénes somos (Brasil)","u":"https://sulfibra.com.br/quem-somos/"},{"t":"LinkedIn","u":"https://br.linkedin.com/company/sulfibra"}]',
 'Lo de "líder en Latinoamérica" es autodescripción de la empresa. No verifiqué si la filial argentina es una entidad legal separada. Sin precios verificados.'),
('servifibras','Servifibras','Comercio argentino de resinas y fibras: importa fibra de vidrio, resinas epoxi y poliéster, goma siliconada y pigmentos. Vende al público y por mayor, sobre todo online.',
 array['Resinas epoxi y poliéster','Fibras y telas de vidrio','Gel coat','Pigmentos y herramientas','Vidrio líquido epoxi'],
 'Buenos Aires; envíos a todo el país','https://www.tiendaservifibras.com/','Tienda propia, Mercado Libre y redes sociales; minorista y mayorista.',
 '[{"t":"Tienda oficial","u":"https://www.tiendaservifibras.com/"},{"t":"Mercado Libre","u":"https://www.mercadolibre.com.ar/tienda/servifibras"},{"t":"Facebook","u":"https://www.facebook.com/ServifibrasBuenosAires/"}]',
 'Su perfil de X lo describe como fabricante de kits, el resto como importador/vendedor: no está claro cuál es. Compite en insumos de fibra y resina, no tanto en poliuretano. Sin precios verificados.')
on conflict (id) do nothing;
