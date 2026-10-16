const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// null = sin tope
const tope = z.union([
  z.null(),
  z.coerce
    .number({ invalid_type_error: 'El tope debe ser un número' })
    .positive('El tope debe ser mayor que cero')
    .max(1e10, 'Tope demasiado grande')
    .transform((n) => Math.round(n * 100) / 100),
]);
const orden = z.coerce.number().int('El orden debe ser un entero').min(0).max(9999);

const createSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre muy corto').max(80),
  tipo: z.enum(['FACTURA', 'VIATICO']),
  topeValor: tope.optional(),
  orden: orden.optional(),
});
const patchSchema = z
  .object({
    nombre: z.string().trim().min(2).max(80).optional(),
    activo: z.boolean().optional(),
    topeValor: tope.optional(),
    orden: orden.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No hay cambios para aplicar');
const idSchema = z.string().uuid('Identificador inválido');
const tipoSchema = z.enum(['FACTURA', 'VIATICO']).optional();

const COLS = 'id, nombre, tipo, activo, tope_valor, orden';
const fmt = (c) => ({
  id: c.id,
  nombre: c.nombre,
  tipo: c.tipo,
  activo: c.activo,
  topeValor: c.tope_valor == null ? null : Number(c.tope_valor),
  orden: c.orden,
});

router.use(requireAuth(), requireTenant);

// GET /api/concepts?tipo=FACTURA|VIATICO
// Todos ven los activos (para sus formularios). El admin puede pedir ?todos=1.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tipo = parse(tipoSchema, req.query.tipo || undefined);
    const todos = req.query.todos === '1' && req.user.isAdmin;

    let q = supabase
      .from('concepts')
      .select(COLS)
      .eq('tenant_id', req.user.tenantId)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });
    if (tipo) q = q.eq('tipo', tipo);
    if (!todos) q = q.eq('activo', true);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ concepts: data.map(fmt) });
  })
);

// POST /api/concepts
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = parse(createSchema, req.body);
    if (d.topeValor != null && d.tipo !== 'VIATICO') {
      throw new HttpError(400, 'El tope por concepto solo aplica a conceptos de viático', 'TOPE_NO_APLICA');
    }

    const { data, error } = await supabase
      .from('concepts')
      .insert({
        tenant_id: req.user.tenantId,
        nombre: d.nombre,
        tipo: d.tipo,
        tope_valor: d.topeValor ?? null,
        orden: d.orden ?? 0,
      })
      .select(COLS)
      .single();
    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'Ya existe un concepto con ese nombre', 'DUPLICADO');
      throw error;
    }

    await audit(req, { tenantId: req.user.tenantId, userId: req.user.id, accion: 'CONCEPTO_CREADO', detalle: d });
    res.status(201).json({ concept: fmt(data) });
  })
);

// PATCH /api/concepts/:id   { nombre?, activo?, topeValor? (null = sin tope), orden? }
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const c = parse(patchSchema, req.body);
    const tenantId = req.user.tenantId;

    const { data: actual, error: e0 } = await supabase
      .from('concepts')
      .select(COLS)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (e0) throw e0;
    if (!actual) throw new HttpError(404, 'Concepto no encontrado', 'NO_ENCONTRADO');

    if (c.topeValor != null && actual.tipo !== 'VIATICO') {
      throw new HttpError(400, 'El tope por concepto solo aplica a conceptos de viático', 'TOPE_NO_APLICA');
    }

    const cambios = {};
    if (c.nombre !== undefined) cambios.nombre = c.nombre;
    if (c.activo !== undefined) cambios.activo = c.activo;
    if (c.topeValor !== undefined) cambios.tope_valor = c.topeValor;
    if (c.orden !== undefined) cambios.orden = c.orden;

    const { data, error } = await supabase
      .from('concepts')
      .update(cambios)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(COLS)
      .maybeSingle();
    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'Ya existe un concepto con ese nombre', 'DUPLICADO');
      throw error;
    }

    await audit(req, {
      tenantId,
      userId: req.user.id,
      accion: 'CONCEPTO_EDITADO',
      detalle: { id, antes: fmt(actual), cambios },
    });
    res.json({ concept: fmt(data) });
  })
);

module.exports = router;