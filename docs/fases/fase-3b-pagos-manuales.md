# Fase 3B: registro de pagos y facturas manuales

Requiere la fase 3 aplicada (usa `tenant_plan`, `plan_tiers` y `tenants.plan_vence_en`).

## Contexto y objetivo

Por ahora InvoiceMan no emite facturas electrónicas por sí mismo: el cobro a los clientes se hace por transferencia y la factura se expide aparte (a mano, con el facturador que elija el dueño). Esta fase agrega un **registro de pagos** del superadmin: cada pago extiende la vigencia de la empresa y deja rastro del valor, el IVA, el método, la referencia y el número de factura (que puede completarse después). Incluye un panel de **pagos sin factura** y un **Excel para el contador**.

El texto "factura" aquí es solo un dato que se registra; la aplicación no emite ni valida facturas ante la DIAN.

## Decisiones de diseño

- **Los precios de los tramos incluyen IVA.** El valor se guarda separado: `valor_base` + `valor_iva` (el total es la suma). El IVA es el 19 % (variable `IVA_PCT`, por defecto 19): `valor_base = round(total / 1.19, 2)` y `valor_iva = total - valor_base`. El formulario pide el **total pagado (IVA incluido)**, calcula base e IVA automáticamente y deja ambos campos editables por si el contador ajusta algo. Si hay más de un valor de IVA posible (por ejemplo un cliente exento), se edita a mano.
- El número de factura es **único** entre pagos (índice parcial, sin distinguir mayúsculas).
- Un pago nuevo extiende desde el vencimiento actual si sigue vigente, o desde hoy si ya venció.
- Los botones "+1 mes" y "+12 meses" de `SuperEmpresa` quedan solo para correcciones o cortesías; los pagos reales usan este registro.
- Solo el superadmin ve y registra pagos.

## 1. Base de datos

Crea `database/NNN_pagos_manuales.sql` (no lo ejecutes):

```sql
create table plan_payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete restrict,
  tier_codigo      text not null references plan_tiers(codigo),
  meses            int  not null check (meses between 1 and 36),
  valor_base       numeric(18,2) not null check (valor_base > 0),
  valor_iva        numeric(18,2) not null default 0 check (valor_iva >= 0),
  metodo           text not null check (metodo in ('TRANSFERENCIA','WOMPI','EFECTIVO','OTRO')),
  referencia_pago  text,
  factura_numero   text,
  factura_fecha    date,
  periodo_desde    timestamptz not null,
  periodo_hasta    timestamptz not null,
  notas            text,
  registrado_por   uuid references users(id),
  created_at       timestamptz not null default now()
);
create index plan_payments_tenant_idx on plan_payments (tenant_id, created_at desc);
create index plan_payments_sinfactura_idx on plan_payments (created_at) where factura_numero is null;
create unique index plan_payments_factura_uk on plan_payments (lower(factura_numero)) where factura_numero is not null;

alter table plan_payments enable row level security;
revoke all on plan_payments from anon, authenticated;

-- Registra el pago y extiende la vigencia en una sola operación
create or replace function registrar_pago_plan(
  p_tenant uuid, p_meses int, p_valor_base numeric, p_valor_iva numeric, p_metodo text,
  p_referencia text, p_factura text, p_factura_fecha date, p_notas text, p_user uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tier text; v_desde timestamptz; v_hasta timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));

  select tier_codigo into v_tier from tenant_plan where tenant_id = p_tenant;
  if v_tier is null then return jsonb_build_object('resultado', 'SIN_PLAN'); end if;

  select greatest(coalesce(plan_vence_en, now()), now()) into v_desde
    from tenants where id = p_tenant for update;
  v_hasta := v_desde + make_interval(months => p_meses);

  insert into plan_payments (tenant_id, tier_codigo, meses, valor_base, valor_iva, metodo, referencia_pago,
                             factura_numero, factura_fecha, periodo_desde, periodo_hasta, notas, registrado_por)
  values (p_tenant, v_tier, p_meses, p_valor_base, coalesce(p_valor_iva, 0), p_metodo, nullif(p_referencia, ''),
          nullif(p_factura, ''), p_factura_fecha, v_desde, v_hasta, nullif(p_notas, ''), p_user)
  returning id into v_id;

  update tenants set plan_vence_en = v_hasta where id = p_tenant;
  return jsonb_build_object('resultado', 'OK', 'id', v_id, 'venceEn', v_hasta);
exception when unique_violation then
  return jsonb_build_object('resultado', 'FACTURA_DUPLICADA');
end $$;

revoke execute on function registrar_pago_plan(uuid,int,numeric,numeric,text,text,text,date,text,uuid) from public, anon, authenticated;
grant  execute on function registrar_pago_plan(uuid,int,numeric,numeric,text,text,text,date,text,uuid) to service_role;

notify pgrst, 'reload schema';
```

## 2. Backend (`src/routes/super.js`, después de las rutas de la fase 3)

Importa `ExcelJS`. Todas las rutas quedan bajo `requireAuth(), requireSuperAdmin`. Respuesta de cada pago (`fmtPago`): `id`, `tramo`, `meses`, `valorBase`, `valorIva`, `total` (base + IVA), `metodo`, `referencia`, `facturaNumero`, `facturaFecha`, `desde`, `hasta`, `notas`, `creadoEn`.

- `GET /tenants/:id/pagos`: últimos 100 de la empresa.
- `POST /tenants/:id/pagos` `{ meses (1 a 36), valorBase (> 0), valorIva (>= 0; el formulario lo calcula al 19 %), metodo, referenciaPago?, facturaNumero?, facturaFecha? ('AAAA-MM-DD'), notas? }`: RPC `registrar_pago_plan` con `p_user = req.user.id`. `FACTURA_DUPLICADA` → 409 "Ese número de factura ya está registrado en otro pago."; `SIN_PLAN` → 404. Audita `SUPER_REGISTRA_PAGO` y responde 201 `{ ok, venceEn }`.
- `PATCH /pagos/:pagoId` `{ facturaNumero?, facturaFecha?, notas? }` (admite `null` para borrar): audita `SUPER_EDITA_PAGO`; el error `23505` → 409 de factura duplicada.
- `GET /pagos/pendientes-factura`: pagos con `factura_numero is null`, más antiguos primero (límite 200), con nombre y NIT de la empresa (consulta separada a `tenants`, sin embebidos).
- `GET /pagos/export?desde&hasta`: Excel con una fila por pago en el rango (fecha local de Colombia, `created_at`, máximo 5000), columnas: Fecha de registro, Empresa, NIT, Tramo, Meses, Periodo desde, Periodo hasta, Valor base, IVA, Total, Método, Referencia de pago, N.º de factura, Fecha de factura, Notas. NIT, referencia y factura como **texto**; valores con formato `#,##0.00`; encabezado en negrita, fila congelada y autofiltro. Audita `SUPER_EXPORTA_PAGOS`.

## 3. Frontend

- **`src/components/PagosEmpresa.jsx`** (props `id`, `plan`, `onRegistrado`): formulario "Registrar un pago recibido" (meses, total pagado (IVA incluido) con enlace "Usar precio del tramo" = precio del tramo actual × meses, con el descuento anual si son 12, y base e IVA calculados al 19 % (editables); método; referencia; número y fecha de factura opcionales; notas) y tabla de historial con edición en línea del número y fecha de factura (etiqueta "Sin factura" mientras falte). Tras registrar, muestra la nueva vigencia y llama a `onRegistrado(venceEn)`.
- **`src/components/FacturacionManual.jsx`**: lista de pagos sin factura con enlace "Registrar factura" a `/super/empresa/:id`, y un bloque con rango de fechas y botón "Descargar Excel para el contador" (usa `descargar` de `api/client`).
- **`src/pages/SuperEmpresa.jsx`**: renderiza `<PagosEmpresa id={id} plan={d} onRegistrado={...} />` debajo del formulario, y actualiza el campo de vigencia con la nueva fecha.
- **`src/pages/Superadmin.jsx`**: agrega `<FacturacionManual />` junto a `<UsoEmpresas />`.

## 4. Pruebas

1. Registra un pago de 12 meses sin factura: la vigencia se extiende un año.
2. El home del superadmin muestra "1 pago sin factura" con enlace a la empresa.
3. Completa número y fecha de factura en el historial: el pago sale de pendientes.
4. Repite un número de factura en otro pago (también con distinta capitalización): 409.
5. Con la vigencia aún activa, el nuevo periodo empieza donde termina el actual; con la vigencia vencida, empieza hoy.
6. El Excel abre con las 15 columnas, NIT/referencia/factura como texto y valores numéricos.
7. Un administrador de empresa recibe 403 en estas rutas.
8. Auditoría: `SUPER_REGISTRA_PAGO`, `SUPER_EDITA_PAGO`, `SUPER_EXPORTA_PAGOS`.

## 5. Entrega

Resumen de archivos y SQL pendiente. Producción (manual): SQL, `git pull`, reconstrucción.
