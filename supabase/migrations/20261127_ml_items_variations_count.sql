-- 27/11: cuántas variaciones tiene cada publicación (para avisar «N variantes sin SKU»).
alter table public.ml_items add column if not exists variations_count integer;
