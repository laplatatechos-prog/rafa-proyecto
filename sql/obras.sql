-- Calendario de obras: todos leen, solo Rafael (con la clave admin) escribe.
create table if not exists public.obras(
 id text primary key,
 fecha date not null,
 dias int not null default 1,
 cliente text not null default '',
 tel text, dir text, cuadrilla text,
 estado text not null default 'senada',
 pres_id text, pres_num text, total numeric, notas text,
 updated_at timestamptz not null default now()
);
alter table public.obras enable row level security;
create policy obras_leer on public.obras for select to anon, authenticated using (true);
grant select on public.obras to anon, authenticated;

create or replace function public.admin_upsert_obra(p_key text, p_obra jsonb) returns boolean
language sql security definer set search_path = public as '
insert into public.obras(id,fecha,dias,cliente,tel,dir,cuadrilla,estado,pres_id,pres_num,total,notas,updated_at)
select p_obra->>''id'', (p_obra->>''fecha'')::date, greatest(1,coalesce((p_obra->>''dias'')::int,1)), coalesce(p_obra->>''cliente'',''''),
 p_obra->>''tel'', p_obra->>''dir'', p_obra->>''cuadrilla'', coalesce(p_obra->>''estado'',''senada''),
 p_obra->>''pres_id'', p_obra->>''pres_num'', nullif(p_obra->>''total'','''')::numeric, p_obra->>''notas'', now()
where public.admin_ok(p_key) is true
on conflict (id) do update set fecha=excluded.fecha, dias=excluded.dias, cliente=excluded.cliente, tel=excluded.tel, dir=excluded.dir,
 cuadrilla=excluded.cuadrilla, estado=excluded.estado, pres_id=excluded.pres_id, pres_num=excluded.pres_num, total=excluded.total,
 notas=excluded.notas, updated_at=now();
select public.admin_ok(p_key);
';

create or replace function public.admin_delete_obra(p_key text, p_id text) returns boolean
language sql security definer set search_path = public as '
delete from public.obras where id = p_id and public.admin_ok(p_key) is true;
select public.admin_ok(p_key);
';

-- 2026-10-22: horario y carga desde cualquier vendedor (aplicado). Borrar sigue siendo solo admin_delete_obra.
alter table public.obras add column if not exists hora time, add column if not exists hora_fin time, add column if not exists cargo text, add column if not exists updated_by text;
-- public.guardar_obra(p_obra jsonb): sql security definer, valida estado, largos y fecha (hoy-400 .. hoy+800). Ver migración obras_guardar_rpc.
