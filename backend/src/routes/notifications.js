const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const { parse } = require('../utils/validate');
const { asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant);

const uuid = z.string().uuid('Identificador inválido');

// GET /api/notifications  -> últimas 50 y conteo de no leídas
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, mensaje, leida, created_at')
      .eq('user_id', req.user.id)
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    res.json({
      noLeidas: data.filter((n) => !n.leida).length,
      notificaciones: data.map((n) => ({ id: n.id, mensaje: n.mensaje, leida: n.leida, fecha: n.created_at })),
    });
  })
);

// POST /api/notifications/read-all
router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from('notifications')
      .update({ leida: true })
      .eq('user_id', req.user.id)
      .eq('tenant_id', req.user.tenantId)
      .eq('leida', false);
    if (error) throw error;
    res.json({ ok: true });
  })
);

// POST /api/notifications/:id/read
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { error } = await supabase
      .from('notifications')
      .update({ leida: true })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('tenant_id', req.user.tenantId);
    if (error) throw error;
    res.json({ ok: true });
  })
);

module.exports = router;