const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { limpiarHtml } = require('../utils/html');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant);

const TITULO_POR_DEFECTO = 'Políticas e instrucciones de uso';
const MAX_HTML_LIMPIO = 100000; // caracteres

const topeSchema = z.object({
  // null = sin tope
  topeViaticos: z.union([
    z.null(),
    z
      .coerce.number({ invalid_type_error: 'El tope debe ser un número' })
      .positive('El tope debe ser mayor que cero')
      .max(1e10, 'Tope demasiado grande')
      .transform((n) => Math.round(n * 100) / 100),
  ]),
});

const infoSchema = z.object({
  titulo: z.string().trim().min(3, 'Título muy corto').max(120, 'Título muy largo'),
  contenidoHtml: z.string().max(300000, 'El contenido es demasiado extenso'),
});

async function leer(tenantId) {
  const { data, error } = await supabase
    .from('tenant_settings')
    .select('tope_viaticos, info_titulo, info_html, info_actualizado_en')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;

  return {
    topeViaticos: data?.tope_viaticos == null ? null : Number(data.tope_viaticos),
    info: {
      titulo: data?.info_titulo ?? TITULO_POR_DEFECTO,
      contenidoHtml: data?.info_html ?? '',
      actualizadoEn: data?.info_actualizado_en ?? null,
    },
  };
}

// ---------- GET /api/settings ----------
// Cualquier usuario: el home muestra la información y el formulario de viáticos muestra el tope
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await leer(req.user.tenantId));
  })
);

// ---------- PATCH /api/settings/viaticos ----------   { "topeViaticos": 500000 | null }
router.patch(
  '/viaticos',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { topeViaticos } = parse(topeSchema, req.body);
    const tenantId = req.user.tenantId;
    const antes = (await leer(tenantId)).topeViaticos;

    const { error } = await supabase
      .from('tenant_settings')
      .upsert({ tenant_id: tenantId, tope_viaticos: topeViaticos }, { onConflict: 'tenant_id' });
    if (error) throw error;

    await audit(req, {
      tenantId,
      userId: req.user.id,
      accion: 'TOPE_VIATICOS_ACTUALIZADO',
      detalle: { antes, despues: topeViaticos },
    });
    res.json({ topeViaticos });
  })
);

// ---------- PUT /api/settings/info ----------   { "titulo": "...", "contenidoHtml": "<p>...</p>" }
router.put(
  '/info',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = parse(infoSchema, req.body);
    const html = limpiarHtml(d.contenidoHtml);
    if (html.length > MAX_HTML_LIMPIO) {
      throw new HttpError(413, 'El contenido es demasiado extenso. Redúcelo o divídelo.', 'CONTENIDO_GRANDE');
    }
    const tenantId = req.user.tenantId;
    const ahora = new Date().toISOString();

    const { error } = await supabase.from('tenant_settings').upsert(
      {
        tenant_id: tenantId,
        info_titulo: d.titulo,
        info_html: html,
        info_actualizado_por: req.user.id,
        info_actualizado_en: ahora,
      },
      { onConflict: 'tenant_id' }
    );
    if (error) throw error;

    await audit(req, {
      tenantId,
      userId: req.user.id,
      accion: 'INFO_ACTUALIZADA',
      detalle: { titulo: d.titulo, caracteres: html.length },
    });
    res.json({ info: { titulo: d.titulo, contenidoHtml: html, actualizadoEn: ahora } });
  })
);

module.exports = router;