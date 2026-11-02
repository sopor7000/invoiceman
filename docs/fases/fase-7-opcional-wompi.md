# Fase 7 (opcional): cobros electrónicos con Wompi

**No empieces esta fase hasta tener funcionando las fases 3 y 3B y haber abierto la cuenta de comercio en Wompi.** Mientras la facturación sea manual, el cobro por transferencia con el registro de pagos de la fase 3B es suficiente. Esta fase agrega el pago en línea con el **checkout web de Wompi** (redirección), sin guardar nunca datos de tarjetas. El cobro automático recurrente (payment sources) queda fuera de esta fase.

Importante: la pasarela cobra pero **no emite la factura** al cliente. Cada pago aprobado queda en el registro de la fase 3B como "sin factura" hasta que se registre su número.

**Verifica contra la documentación vigente de Wompi** los nombres exactos de los parámetros del checkout, la fórmula de la firma de integridad y las URLs de la API antes de dar la fase por terminada. Si algo difiere, detente y avisa.

## Diseño

- El administrador de la empresa pulsa "Pagar 1 mes" o "Pagar 12 meses" en una pantalla **Facturación**.
- El servidor calcula el monto con el tramo y los precios de la empresa (nunca viene del navegador), crea una orden `PENDING` con una referencia única y devuelve la URL del checkout firmado.
- Al terminar, Wompi redirige a `/facturacion?ref=...` y envía un evento `transaction.updated` al webhook.
- El webhook verifica la firma, **consulta la transacción a la API de Wompi** (no confía solo en el aviso) y aplica el resultado con una función SQL atómica e idempotente que extiende el plan y registra el pago en `plan_payments`.

## 1. Base de datos

Requiere `plan_payments` (fase 3B). Crea `database/NNN_pagos_wompi.sql` (sin ejecutar):

```sql
create table billing_orders (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete restrict,
  reference             text not null,
  meses                 int  not null check (meses in (1, 12)),
  tier_codigo           text references plan_tiers(codigo),
  amount_cents          bigint not null check (amount_cents > 0),
  currency              char(3) not null default 'COP',
  status                text not null default 'PENDING'
                        check (status in ('PENDING','APPROVED','DECLINED','VOIDED','ERROR')),
  wompi_transaction_id  text,
  payment_method_type   text,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  constraint billing_ref_uk unique (reference),
  constraint billing_tx_uk  unique (wompi_transaction_id)
);
create index billing_tenant_idx on billing_orders (tenant_id, created_at desc);

alter table billing_orders enable row level security;
revoke all on billing_orders from anon, authenticated;

-- Confirma un pago de forma atómica e idempotente
create or replace function confirmar_pago(
  p_reference text, p_tx_id text, p_status text, p_amount bigint, p_metodo text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o billing_orders%rowtype;
begin
  select * into o from billing_orders where reference = p_reference for update;
  if not found then return jsonb_build_object('resultado', 'NO_EXISTE'); end if;
  if o.amount_cents <> p_amount then return jsonb_build_object('resultado', 'MONTO_NO_COINCIDE'); end if;
  if o.status = 'APPROVED' then return jsonb_build_object('resultado', 'YA_APLICADO'); end if;
  if p_status not in ('APPROVED','DECLINED','VOIDED','ERROR') then
    return jsonb_build_object('resultado', 'NO_FINAL');
  end if;

  update billing_orders
     set status = p_status,
         wompi_transaction_id = p_tx_id,
         payment_method_type = p_metodo,
         paid_at = case when p_status = 'APPROVED' then now() end
   where id = o.id;

  if p_status = 'APPROVED' then
    update tenants
       set plan_vence_en = greatest(coalesce(plan_vence_en, now()), now()) + make_interval(months => o.meses)
     where id = o.tenant_id;

    insert into plan_payments (tenant_id, tier_codigo, meses, valor_base, valor_iva, metodo, referencia_pago,
                               periodo_desde, periodo_hasta)
    select o.tenant_id, coalesce(o.tier_codigo, tp.tier_codigo), o.meses,
           round(o.amount_cents / 100.0 / 1.19, 2),
           o.amount_cents / 100.0 - round(o.amount_cents / 100.0 / 1.19, 2),
           'WOMPI', o.reference, t.plan_vence_en - make_interval(months => o.meses), t.plan_vence_en
      from tenants t join tenant_plan tp on tp.tenant_id = t.id
     where t.id = o.tenant_id;
  end if;

  return jsonb_build_object('resultado', p_status, 'tenant_id', o.tenant_id);
end $$;

revoke execute on function confirmar_pago(text, text, text, bigint, text) from public, anon, authenticated;
grant  execute on function confirmar_pago(text, text, text, bigint, text) to service_role;

notify pgrst, 'reload schema';
```

Nota: el precio de los tramos incluye IVA (19 %). En `confirmar_pago` el total cobrado se separa en `valor_base = round(total/1.19, 2)` y `valor_iva = total - valor_base`.

## 2. Backend: `src/routes/billing.js` (nuevo) y registro `app.use('/api/billing', ...)`

Variables (solo `process.env`, nunca valores en el código): `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_API_URL` (sandbox o producción), `APP_URL`. Si falta alguna, las rutas responden 503 `PAGOS_NO_CONFIGURADOS`. Documéntalas en `backend/.env.example`.

- `POST /api/billing/wompi/webhook` (**público**, definido antes de `router.use(requireAuth...)`):
  1. Si `event` no es `transaction.updated`, responde 200.
  2. Verifica el checksum: toma `signature.properties` (rutas relativas a `data`, por ejemplo `transaction.id`), concatena sus valores **en orden**, luego `timestamp` y `WOMPI_EVENTS_SECRET`, aplica SHA-256 y compara con el encabezado `X-Event-Checksum` (o `signature.checksum`) con comparación de tiempo constante. Si no coincide, 400.
  3. Consulta `GET {WOMPI_API_URL}/transactions/{id}` y usa los datos **de esa respuesta** (`reference`, `status`, `amount_in_cents`, `payment_method_type`).
  4. Llama al RPC `confirmar_pago`. Si el RPC falla, responde error (para no perder el aviso); si funciona, 200.
  5. Si el resultado es `APPROVED`, audita `PAGO_APROBADO`.
- `router.use(requireAuth(), requireTenant, requireAdmin)` para lo siguiente; un superadmin recibe 403 `SUPER_NO_PAGA`.
- `GET /api/billing/orders`: `planVenceEn` y las últimas 50 órdenes (`referencia`, `meses`, `valor`, `estado`, `metodo`, fechas).
- `POST /api/billing/checkout` `{ meses: 1 | 12 }`:
  - Lee el tramo y el descuento anual de `tenant_plan` y el precio de `tenant_tier_prices`; si no hay precio, 409 `SIN_PRECIO`.
  - Monto = precio × meses (con el descuento anual si son 12), en centavos redondeados.
  - Referencia `IM-` + 16 caracteres hexadecimales aleatorios; inserta la orden `PENDING` con el `tier_codigo`.
  - Firma de integridad = SHA-256 de `referencia + montoEnCentavos + 'COP' + WOMPI_INTEGRITY_SECRET` (verifica la fórmula en la documentación).
  - Devuelve `{ url, referencia }` con la URL del checkout web de Wompi y los parámetros (llave pública, moneda, monto, referencia, firma y `redirect-url` = `${APP_URL}/facturacion?ref=<referencia>`).
  - Audita `PAGO_INICIADO`.

## 3. Frontend

- `src/pages/Facturacion.jsx` (ruta `/facturacion`, solo administradores; enlace "Facturación" en el menú): vigencia del plan, botones "Pagar 1 mes" y "Pagar 12 meses" (redirigen a la URL del checkout con `window.location.assign`), historial de pagos y, si la URL trae `?ref=`, un aviso que consulta cada 3 segundos (máximo 10 veces) hasta ver el resultado: "Estamos confirmando tu pago…", "Pago aprobado" o "El pago no fue aprobado".
- Texto visible: "Serás redirigido a Wompi. InvoiceMan no recibe ni guarda datos de tu tarjeta."

## 4. Pruebas en sandbox

Wompi necesita una URL pública para el webhook: usa un túnel (cloudflared o ngrok) hacia el puerto 4000 y registra `https://<túnel>/api/billing/wompi/webhook` como URL de eventos del **ambiente de pruebas**; pon esa URL base en `APP_URL`.

1. Como administrador de empresa, pagar 1 mes con medios de prueba de Wompi: al volver aparece "Pago aprobado" y la vigencia se extiende un mes.
2. Un pago rechazado: estado rechazado y la vigencia no cambia.
3. Evento con firma alterada: 400 y sin cambios.
4. Mismo evento aprobado enviado dos veces: la vigencia se extiende **una sola vez**.
5. Monto de la orden modificado en la base antes de pagar: resultado `MONTO_NO_COINCIDE` y sin extensión.
6. Cada pago aprobado aparece en el registro de la fase 3B con método Wompi y sin factura.
7. Un superadmin recibe 403 en `/api/billing/checkout`.

## 5. Salida a producción (manual)

SQL en producción; llaves de **producción** de Wompi, `WOMPI_API_URL` de producción y `APP_URL` final en el VPS; registrar la URL de eventos de producción en el panel de Wompi; un **pago real de monto bajo** para verificar el flujo completo.
