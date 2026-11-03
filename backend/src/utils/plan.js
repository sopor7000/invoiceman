const supabase = require('./supabase');
const { HttpError } = require('./errors');

const DIA_MS = 24 * 60 * 60 * 1000;
const AVISO_DIAS = 7;

// Estado de la vigencia del plan de una compañía
function estadoPlan(venceEn) {
  const graciaDias = Number(process.env.PLAN_GRACIA_DIAS) || 7;
  if (!venceEn) return { estado: 'SIN_VIGENCIA', venceEn: null, diasRestantes: null, graciaDias };

  const diff = new Date(venceEn).getTime() - Date.now();
  const diasRestantes = Math.ceil(diff / DIA_MS);

  let estado;
  if (diff >= 0) estado = diasRestantes <= AVISO_DIAS ? 'POR_VENCER' : 'VIGENTE';
  else estado = -diff < graciaDias * DIA_MS ? 'GRACIA' : 'VENCIDO';

  return { estado, venceEn, diasRestantes, graciaDias };
}

// Traduce el error del trigger de límite de usuarios (LIMITE_USUARIOS:limite|activos)
function errorLimite(error) {
  const m = /LIMITE_USUARIOS:(\d+)\|(\d+)/.exec(error?.message || '');
  if (!m) return null;
  return new HttpError(
    409,
    `Tu plan permite hasta ${m[1]} usuarios activos y esta operación llevaría a ${m[2]}. ` +
      'Sube de tramo en la sección Plan para agregar más. No se realizó ningún cambio.',
    'LIMITE_USUARIOS'
  );
}

// Tramo actual, límite, usuarios activos y catálogo de tramos con los precios de la compañía.
// Consultas separadas (sin selects embebidos).
async function resumenPlan(tenantId) {
  const [plan, tiers, precios, activos] = await Promise.all([
    supabase.from('tenant_plan').select('tier_codigo, limite_usuarios, descuento_anual_pct').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('plan_tiers').select('codigo, nombre, min_usuarios, max_usuarios, orden, cotizacion_manual').order('orden'),
    supabase.from('tenant_tier_prices').select('tier_codigo, precio_mes').eq('tenant_id', tenantId),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('activo', true),
  ]);
  for (const r of [plan, tiers, precios, activos]) if (r.error) throw r.error;

  const usuariosActivos = activos.count ?? 0;
  const precioDe = new Map(precios.data.map((p) => [p.tier_codigo, Number(p.precio_mes)]));
  const actual = plan.data?.tier_codigo ?? null;

  return {
    tramoActual: actual,
    limiteUsuarios: plan.data?.limite_usuarios ?? null,
    descuentoAnualPct: Number(plan.data?.descuento_anual_pct ?? 0),
    usuariosActivos,
    tramos: tiers.data.map((t) => ({
      codigo: t.codigo,
      nombre: t.nombre,
      min: t.min_usuarios,
      max: t.max_usuarios,
      cotizacionManual: t.cotizacion_manual,
      precioMes: precioDe.get(t.codigo) ?? null,
      actual: t.codigo === actual,
      cabe: t.max_usuarios === null || usuariosActivos <= t.max_usuarios,
    })),
  };
}

module.exports = { estadoPlan, errorLimite, resumenPlan };
