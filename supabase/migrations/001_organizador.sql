-- Organizador de obras: extiende tpl-presupuestos sin tocar tablas existentes.
-- Las tablas nuevas no se leen ni escriben con la clave pública: todo pasa por
-- funciones que piden la clave de administrador (mismo esquema que admin_upsert_obra).

create table if not exists public.obra_detalle (
  obra_id        text primary key references public.obras(id) on delete cascade,
  trabajo        text,                       -- trabajo a realizar
  situacion      text,                       -- en qué situación está (texto libre)
  necesita_seco  boolean not null default true, -- si la lluvia impide trabajar
  pedido_estado  text not null default 'pendiente' check (pedido_estado in ('pendiente','hecho','recibido')),
  pedido_pagado  boolean not null default false,
  pedido_proveedor text,
  pedido_fecha   date,
  -- Variables para priorizar
  urgencia       text not null default 'media' check (urgencia in ('baja','media','alta','urgente')),
  cliente_desde  date,                       -- desde cuándo es cliente (viejo / nuevo)
  esperando_desde date default public.tpl_hoy(), -- desde cuándo espera que se haga el trabajo
  updated_at     timestamptz not null default now()
);

create table if not exists public.obra_materiales (
  id          uuid primary key default gen_random_uuid(),
  obra_id     text not null references public.obras(id) on delete cascade,
  catalogo_id text references public.catalogo(id) on delete set null,
  nombre      text not null,
  unidad      text default 'u',
  cantidad    numeric not null default 1,
  precio_unit numeric not null default 0,
  orden       int not null default 0
);
create index if not exists obra_materiales_obra on public.obra_materiales(obra_id);

create table if not exists public.obra_cobros (
  id       uuid primary key default gen_random_uuid(),
  obra_id  text not null references public.obras(id) on delete cascade,
  fecha    date not null default public.tpl_hoy(),
  monto    numeric not null check (monto <> 0),
  medio    text,
  nota     text,
  created_at timestamptz not null default now()
);
create index if not exists obra_cobros_obra on public.obra_cobros(obra_id);

alter table public.obra_detalle    enable row level security;
alter table public.obra_materiales enable row level security;
alter table public.obra_cobros     enable row level security;
-- Sin políticas: anon no ve nada. Solo las funciones security definer.

-- Lista todo lo que necesita el tablero.
create or replace function public.org_listar(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.admin_ok(p_key) is not true then raise exception 'clave incorrecta'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'fecha') from (
      select to_jsonb(o) || jsonb_build_object(
        'detalle', (select to_jsonb(d) - 'obra_id' from obra_detalle d where d.obra_id = o.id),
        'materiales', coalesce((select jsonb_agg(to_jsonb(m) order by m.orden, m.nombre) from obra_materiales m where m.obra_id = o.id), '[]'),
        'cobros', coalesce((select jsonb_agg(to_jsonb(c) order by c.fecha) from obra_cobros c where c.obra_id = o.id), '[]'),
        'total_materiales', coalesce((select sum(cantidad*precio_unit) from obra_materiales m where m.obra_id = o.id), 0),
        'cobrado', coalesce((select sum(monto) from obra_cobros c where c.obra_id = o.id), 0),
        -- Datos del sistema de presupuestos: cuándo se presupuestó y qué seña/forma de pago aceptó
        'presupuesto_fecha', (select p.created_at from presupuestos p where p.id = o.pres_id),
        'aceptacion', (select jsonb_build_object('fecha', a.created_at, 'forma', a.forma, 'cuotas', a.cuotas,
                                                 'monto', a.monto, 'anticipo', a.anticipo, 'fecha_obra_pedida', a.fecha_obra)
                       from aceptaciones a where a.pres_id = o.pres_id)
      ) as x
      from obras o
    ) s
  ), '[]'::jsonb);
end $$;

-- Guarda una obra completa: datos base + detalle + materiales (reemplaza la lista).
-- p: {id?, fecha, dias, cliente, tel, dir, estado, total, notas, detalle:{...}, materiales:[...]}
create or replace function public.org_guardar(p_key text, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text := coalesce(nullif(p->>'id',''), 'o' || replace(gen_random_uuid()::text,'-',''));
        d jsonb := coalesce(p->'detalle','{}');
begin
  if public.admin_ok(p_key) is not true then raise exception 'clave incorrecta'; end if;

  insert into obras(id, fecha, dias, cliente, tel, dir, cuadrilla, estado, total, notas, updated_by, updated_at)
  values (left(v_id,40), coalesce(nullif(p->>'fecha','')::date, tpl_hoy()), greatest(1,coalesce(nullif(p->>'dias','')::int,1)),
          left(coalesce(p->>'cliente',''),120), left(p->>'tel',40), left(p->>'dir',200), left(p->>'cuadrilla',60),
          case when p->>'estado' in ('aceptado','senada','curso','terminada') then p->>'estado' else 'aceptado' end,
          nullif(p->>'total','')::numeric, left(p->>'notas',1000), 'organizador', now())
  on conflict (id) do update set
    fecha = excluded.fecha, dias = excluded.dias, cliente = excluded.cliente, tel = excluded.tel, dir = excluded.dir,
    cuadrilla = coalesce(excluded.cuadrilla, obras.cuadrilla), estado = excluded.estado,
    total = excluded.total, notas = excluded.notas, updated_by = 'organizador', updated_at = now();

  insert into obra_detalle(obra_id, trabajo, situacion, necesita_seco, pedido_estado, pedido_pagado, pedido_proveedor, pedido_fecha,
                           urgencia, cliente_desde, esperando_desde, updated_at)
  values (v_id, d->>'trabajo', d->>'situacion', coalesce((d->>'necesita_seco')::boolean, true),
          case when d->>'pedido_estado' in ('pendiente','hecho','recibido') then d->>'pedido_estado' else 'pendiente' end,
          coalesce((d->>'pedido_pagado')::boolean, false), d->>'pedido_proveedor', nullif(d->>'pedido_fecha','')::date,
          case when d->>'urgencia' in ('baja','media','alta','urgente') then d->>'urgencia' else 'media' end,
          nullif(d->>'cliente_desde','')::date, coalesce(nullif(d->>'esperando_desde','')::date, tpl_hoy()), now())
  on conflict (obra_id) do update set
    trabajo = excluded.trabajo, situacion = excluded.situacion, necesita_seco = excluded.necesita_seco,
    pedido_estado = excluded.pedido_estado, pedido_pagado = excluded.pedido_pagado,
    pedido_proveedor = excluded.pedido_proveedor, pedido_fecha = excluded.pedido_fecha,
    urgencia = excluded.urgencia, cliente_desde = excluded.cliente_desde,
    esperando_desde = coalesce(nullif(d->>'esperando_desde','')::date, obra_detalle.esperando_desde), updated_at = now();

  if p ? 'materiales' then
    delete from obra_materiales where obra_id = v_id;
    insert into obra_materiales(obra_id, catalogo_id, nombre, unidad, cantidad, precio_unit, orden)
    select v_id, nullif(m->>'catalogo_id',''), left(coalesce(m->>'nombre','?'),120), left(coalesce(m->>'unidad','u'),10),
           coalesce(nullif(m->>'cantidad','')::numeric,1), coalesce(nullif(m->>'precio_unit','')::numeric,0), (ord-1)::int
    from jsonb_array_elements(p->'materiales') with ordinality as t(m, ord);
  end if;
  return v_id;
end $$;

create or replace function public.org_cobro(p_key text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if public.admin_ok(p_key) is not true then raise exception 'clave incorrecta'; end if;
  insert into obra_cobros(obra_id, fecha, monto, medio, nota)
  values (p->>'obra_id', coalesce(nullif(p->>'fecha','')::date, tpl_hoy()), (p->>'monto')::numeric, p->>'medio', p->>'nota')
  returning id into v;
  return v;
end $$;

create or replace function public.org_borrar_cobro(p_key text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.admin_ok(p_key) is not true then raise exception 'clave incorrecta'; end if;
  delete from obra_cobros where id = p_id;
  return found;
end $$;

revoke all on function public.org_listar(text), public.org_guardar(text,jsonb), public.org_cobro(text,jsonb), public.org_borrar_cobro(text,uuid) from public;
grant execute on function public.org_listar(text), public.org_guardar(text,jsonb), public.org_cobro(text,jsonb), public.org_borrar_cobro(text,uuid) to anon, authenticated, service_role;
