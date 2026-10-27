-- Presupuesto online (2026-10-27): el cliente abre el link, elige forma de pago, carga datos, firma y elige fecha.
create table if not exists public.aceptaciones(
 pres_id text primary key,
 pres_num text, vend text,
 forma text not null, cuotas int, monto numeric, cuota numeric, anticipo numeric,
 nombre text not null, dni text, tel text, email text, dir text,
 fecha_obra date not null, firma text not null,
 created_at timestamptz not null default now()
);
alter table public.aceptaciones enable row level security;

create or replace function public.tpl_hoy() returns date language sql stable as
'select (now() at time zone ''America/Argentina/Buenos_Aires'')::date';

-- Días tomados por obras no terminadas (cupo = obras por día, en config; 1 por defecto). Sin domingos.
create or replace function public.dias_ocupados() returns setof date
language sql stable security definer set search_path = public as '
with cup as (select greatest(1,coalesce(nullif(data->>''cupo'','''')::int,1)) n from public.config where id=1),
d as (
 select x.d::date f, o.id from public.obras o,
 lateral (select g d from generate_series(o.fecha::timestamp, (o.fecha + o.dias*2 + 7)::timestamp, interval ''1 day'') g
          where extract(dow from g) <> 0 order by g limit o.dias) x
 where o.estado <> ''terminada'' and o.fecha >= public.tpl_hoy() - 120)
select f from d where f >= public.tpl_hoy() group by f
having count(distinct id) >= coalesce((select n from cup),1) order by f';

-- Lo único que ve el cliente de una aceptación: si ya está aceptado y para cuándo
create or replace function public.aceptacion_estado(p_pres_id text) returns jsonb
language sql stable security definer set search_path = public as '
select jsonb_build_object(''forma'',forma,''cuotas'',cuotas,''fecha_obra'',fecha_obra,''created_at'',created_at)
from public.aceptaciones where pres_id = p_pres_id';

-- Para el historial de los vendedores (sin firma ni DNI)
create or replace function public.aceptados_resumen() returns table(pres_id text, forma text, cuotas int, fecha_obra date, created_at timestamptz)
language sql stable security definer set search_path = public as '
select pres_id, forma, cuotas, fecha_obra, created_at from public.aceptaciones order by created_at desc limit 500';

-- Para Rafael en Admin TPL (con firma), solo con la clave
create or replace function public.admin_aceptaciones(p_key text) returns setof public.aceptaciones
language sql stable security definer set search_path = public as '
select a.* from public.aceptaciones a where public.admin_ok(p_key) is true order by a.created_at desc limit 300';

create or replace function public.aceptar_presupuesto(p jsonb) returns jsonb
language sql security definer set search_path = public as '
with pr as (select * from public.presupuestos where id = p->>''pres_id''),
cf as (select coalesce(pr.data->''cfgSnap'', (select data from public.config where id=1), ''{}''::jsonb) s from pr),
hoy as (select public.tpl_hoy() h),
plan as (
 select split_part(x,''='',1)::int n, split_part(x,''='',2)::numeric r
 from cf, regexp_split_to_table(regexp_replace(coalesce(cf.s->>''planes'',''''),''\s'','''',''g''), ''[,;]'') x
 where x ~ ''^\d+=\d+(\.\d+)?$''),
v as (
 select pr.id, pr.num, pr.vend, pr.cli, (pr.data->>''total'')::numeric fin, cf.s,
  coalesce(nullif(cf.s->>''pct'','''')::numeric,20) pct, coalesce(nullif(cf.s->>''anticipo'','''')::numeric,50) ant,
  (p->>''fecha_obra'')::date fo, p->>''forma'' forma, nullif(p->>''cuotas'','''')::int nc,
  (select r from plan where n = nullif(p->>''cuotas'','''')::int limit 1) rec,
  case
   when exists(select 1 from public.aceptaciones a where a.pres_id = pr.id) then ''ya_aceptado''
   when (pr.data->>''fecha'')::timestamptz::date + coalesce(nullif(cf.s->>''dias'','''')::int,5) < (select h from hoy) then ''vencido''
   when coalesce(p->>''forma'','''') not in (''anticipo'',''final'',''tarjeta'') then ''forma''
   when p->>''forma'' = ''tarjeta'' and not exists(select 1 from plan where n = nullif(p->>''cuotas'','''')::int) then ''cuotas''
   when length(trim(coalesce(p->>''nombre'',''''))) not between 3 and 120 then ''nombre''
   when coalesce(p->>''dni'','''') !~ ''^\d{7,9}$'' then ''dni''
   when length(regexp_replace(coalesce(p->>''tel'',''''),''\D'','''',''g'')) not between 6 and 15 then ''tel''
   when length(trim(coalesce(p->>''dir'',''''))) not between 3 and 200 then ''dir''
   when length(coalesce(p->>''email'','''')) > 120 then ''email''
   when (p->>''fecha_obra'')::date < (select h from hoy) + coalesce(nullif(cf.s->>''minDias'','''')::int,2)
     or (p->>''fecha_obra'')::date > (select h from hoy) + 150
     or extract(dow from (p->>''fecha_obra'')::date) = 0 then ''fecha''
   when (p->>''fecha_obra'')::date in (select public.dias_ocupados()) then ''ocupado''
   when coalesce(p->>''firma'','''') not like ''data:image/png;base64,%'' or length(p->>''firma'') not between 800 and 400000 then ''firma''
   else null end err
 from pr, cf),
m as (select v.*, case when pct > 0 and pct < 90 then fin/(1-pct/100) else fin end lista from v),
mm as (select m.*, round(case forma when ''anticipo'' then fin when ''final'' then lista else lista*(1+coalesce(rec,0)/100) end) monto from m),
ins as (
 insert into public.aceptaciones(pres_id,pres_num,vend,forma,cuotas,monto,cuota,anticipo,nombre,dni,tel,email,dir,fecha_obra,firma)
 select id, num, vend, forma, case when forma=''tarjeta'' then nc end, monto,
  case when forma=''tarjeta'' then round(monto/nc) end, case when forma=''anticipo'' then round(monto*ant/100) end,
  left(trim(p->>''nombre''),120), p->>''dni'', left(p->>''tel'',40), nullif(left(trim(coalesce(p->>''email'','''')),120),''''), left(trim(p->>''dir''),200), fo, p->>''firma''
 from mm where err is null
 on conflict (pres_id) do nothing returning *),
ob as (
 insert into public.obras(id,fecha,dias,cliente,tel,dir,estado,pres_id,pres_num,total,notas,cargo,updated_by,updated_at)
 select ''web-''||i.pres_id, i.fecha_obra, 1, i.nombre, i.tel, i.dir, ''aceptado'', i.pres_id, i.pres_num, i.monto,
  ''Aceptado online por el cliente. Pago: ''||case i.forma when ''anticipo'' then ''anticipo ''||(select ant from v)::int||''% ($''||i.anticipo||'') y saldo al finalizar''
    when ''final'' then ''todo al finalizar'' else i.cuotas||'' cuotas con tarjeta de $''||i.cuota end
  ||''. DNI ''||i.dni||coalesce(''. Mail ''||i.email,'''')||''. Vendedor: ''||coalesce(i.vend,''''), ''cliente (web)'', ''cliente (web)'', now()
 from ins i
 on conflict (id) do nothing returning 1)
select case when (select count(*) from ins) = 1 then
  jsonb_build_object(''ok'',true,''monto'',(select monto from ins),''cuota'',(select cuota from ins),''anticipo'',(select anticipo from ins),''obra'',(select count(*) from ob))
 else jsonb_build_object(''ok'',false,''err'',coalesce((select err from v),''no_existe'')) end';

-- Estado nuevo de obra: "aceptado" (el cliente aceptó online, falta confirmar la seña)
create or replace function public.guardar_obra(p_obra jsonb) returns boolean
language sql security definer set search_path = public as '
insert into public.obras(id,fecha,dias,hora,hora_fin,cliente,tel,dir,cuadrilla,estado,pres_id,pres_num,total,notas,cargo,updated_by,updated_at)
select left(p_obra->>''id'',40), (p_obra->>''fecha'')::date, least(60,greatest(1,coalesce((p_obra->>''dias'')::int,1))),
 nullif(p_obra->>''hora'','''')::time, nullif(p_obra->>''hora_fin'','''')::time,
 left(coalesce(p_obra->>''cliente'',''''),120), left(p_obra->>''tel'',40), left(p_obra->>''dir'',200), left(p_obra->>''cuadrilla'',60),
 case when p_obra->>''estado'' in (''aceptado'',''senada'',''curso'',''terminada'') then p_obra->>''estado'' else ''senada'' end,
 left(p_obra->>''pres_id'',40), left(p_obra->>''pres_num'',20), nullif(p_obra->>''total'','''')::numeric, left(p_obra->>''notas'',1000),
 left(p_obra->>''cargo'',60), left(p_obra->>''updated_by'',60), now()
where coalesce(p_obra->>''id'','''') <> '''' and (p_obra->>''fecha'')::date between current_date - 400 and current_date + 800
on conflict (id) do update set fecha=excluded.fecha, dias=excluded.dias, hora=excluded.hora, hora_fin=excluded.hora_fin, cliente=excluded.cliente,
 tel=excluded.tel, dir=excluded.dir, cuadrilla=excluded.cuadrilla, estado=excluded.estado, pres_id=excluded.pres_id, pres_num=excluded.pres_num,
 total=excluded.total, notas=excluded.notas, cargo=coalesce(public.obras.cargo,excluded.cargo), updated_by=excluded.updated_by, updated_at=now();
select true;
';

grant execute on function public.dias_ocupados(), public.aceptacion_estado(text), public.aceptados_resumen(), public.admin_aceptaciones(text), public.aceptar_presupuesto(jsonb), public.tpl_hoy() to anon, authenticated;
