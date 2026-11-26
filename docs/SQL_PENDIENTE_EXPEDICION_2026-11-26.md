# Expedición en Poliplast App: qué puede leer en la base (SIN APLICAR)

Pedido de Felipe (25/11): expedición se maneja como un usuario normal con su rol, pero es una cuenta compartida
(expedicion@grupopoliplast.com.ar) que usan varios: al entrar eligen **quién es** y **desde qué depósito**.
Antes de darle esa cuenta en Poliplast App hay que limitar en la BASE lo que puede leer (ocultar el menú no alcanza).
Esto se aplica solo con el OK de Felipe y después de probarlo en el link de prueba.

## Cómo está hoy (leído de la base el 26/11, solo lectura)

- Casi todas las tablas del CRM (≈55: clientes, contactos, tareas, facturación de Contabilium, Mercado Libre, Shopify,
  precios, catálogo, conversaciones, notas del equipo, espacio de trabajo, fichas técnicas…) dejan leer a quien
  cumple `is_poliplast_crm_user()` = cualquier mail `@grupopoliplast.com.ar` (más el Gmail de Felipe).
  **Hoy expedicion@ las puede leer todas.**
- Las tablas de Entregas (`entregas_*` y el bucket `entregas`) usan otra regla, `entregas_mi_rol()`. expedicion@
  tiene su fila propia en `entregas_roles` con rol `expedicion`, así que no depende de la regla del CRM.
- Excepciones: `competitors` deja leer a cualquier cuenta logueada (`true`); `product-photos` es público (fotos).

## Cambio propuesto (un solo lugar)

Que `is_poliplast_crm_user()` devuelva falso para la cuenta compartida. Con eso, expedicion@ deja de leer todas
las tablas del CRM de una vez y sigue usando Entregas igual (su rol en `entregas_roles` no cambia).

```sql
create or replace function public.is_poliplast_crm_user()
returns boolean language sql stable security definer set search_path = public as $$
  select
    (lower(coalesce(auth.jwt() ->> 'email', '')) = 'felipecnokaert@gmail.com'
      or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@grupopoliplast.com.ar')
    -- Poliplast App: la cuenta compartida de expedición no lee datos del CRM (solo Entregas, por su propio rol).
    and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'expedicion@grupopoliplast.com.ar';
$$;

-- competitors hoy deja leer a cualquiera logueado: pasarlo a la regla del equipo.
drop policy if exists competitors_read on public.competitors;
create policy competitors_read on public.competitors for select to authenticated using ((select public.is_poliplast_crm_user()));
```

Para volver atrás: la misma función sin la línea de expedición, y la política de `competitors` con `using (true)`.

## Qué deja de andar para expedicion@ (y está bien)

- Leer clientes, facturación, ventas, Mercado Libre, Shopify, precios, tareas y notas del equipo.
- En Entregas, la búsqueda del teléfono del cliente para «avisar al cliente» (es una función de vendedores; ya
  está en un try/catch y devuelve vacío).
- Su propio espacio de trabajo (`workspace_states`): en Poliplast App la cuenta de expedición no guarda nada ahí
  (la elección de persona y depósito queda en el equipo).

## Antes de aplicarlo (checklist)

1. Probar con la cuenta expedicion@ en el link de prueba conectado a la base: Entregas (pedidos, expedición hoy,
   subir guías, firmar remito) tiene que andar igual.
2. Revisar que la app de conteo no use la sesión de expedicion@ contra tablas del CRM (hoy habla por la API con
   clave, `/api/entregas/*`, que corre con la clave del servidor: no le afecta).
3. Avisar al chat del CRM y al de conteo el mismo día.
4. El asistente ya filtra por rol en el servidor (`lib/assistant-scope.mjs`, expedicion@ fija como Expedición).
