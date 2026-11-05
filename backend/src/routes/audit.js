const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const { parse } = require('../utils/validate');
const { asyncHandler } = require('../utils/errors');
const { etiqueta, sinSecretos } = require('../utils/auditEtiquetas');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant, requireAdmin);

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

const listSchema = z.object({
  page: z.coerce.number().int().min(1, 'Página inválida').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Máximo 100 registros por página').default(25),
  accion: z.string().regex(/^[A-Z0-9_]{1,80}$/, 'Acción inválida').optional(),
  usuarioId: z.string().uuid('Usuario inválido').optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
});

// Descarta los parámetros vacíos de la consulta
const limpiarQuery = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined));

// ---------- GET /api/audit ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = parse(listSchema, limpiarQuery(req.query));
    const desdeFila = (f.page - 1) * f.limit;

    let q = supabase
      .from('audit_logs')
      .select('id, user_id, accion, detalle, ip, created_at', { count: 'exact' })
      .eq('tenant_id', req.user.tenantId)
      .not('accion', 'like', 'SUPER_*') // las acciones del superadmin no se muestran a la empresa
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(desdeFila, desdeFila + f.limit - 1);
    if (f.accion) q = q.eq('accion', f.accion);
    if (f.usuarioId) q = q.eq('user_id', f.usuarioId);
    if (f.desde) q = q.gte('created_at', `${f.desde}T00:00:00-05:00`);
    if (f.hasta) q = q.lte('created_at', `${f.hasta}T23:59:59.999-05:00`);

    const { data, count, error } = await q;
    if (error) throw error;

    const ids = [...new Set(data.map((a) => a.user_id).filter(Boolean))];
    let nombres = new Map();
    if (ids.length) {
      const { data: us, error: uErr } = await supabase
        .from('users')
        .select('id, nombre')
        .eq('tenant_id', req.user.tenantId)
        .in('id', ids);
      if (uErr) throw uErr;
      nombres = new Map(us.map((u) => [u.id, u.nombre]));
    }

    res.json({
      total: count ?? 0,
      page: f.page,
      limit: f.limit,
      items: data.map((a) => ({
        id: a.id,
        fecha: a.created_at,
        usuario: a.user_id ? nombres.get(a.user_id) ?? 'Soporte InvoiceMan' : null,
        accion: a.accion,
        etiqueta: etiqueta(a.accion),
        detalle: sinSecretos(a.detalle),
        ip: a.ip,
      })),
    });
  })
);

// ---------- GET /api/audit/acciones ----------
router.get(
  '/acciones',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase.rpc('acciones_auditoria', { p_tenant: req.user.tenantId });
    if (error) throw error;
    const acciones = (data || [])
      .map((r) => ({ accion: r.accion, etiqueta: etiqueta(r.accion) }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
    res.json({ acciones });
  })
);

module.exports = router;
