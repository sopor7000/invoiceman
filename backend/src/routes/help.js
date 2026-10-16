const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant);

const BUCKET = 'ayuda';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // tope del plan gratuito de Supabase
});

const MIME = {
  VIDEO: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
  PRESENTACION: {
    'application/pdf': 'pdf',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  },
};

const createSchema = z.object({
  tipo: z.enum(['VIDEO', 'PRESENTACION', 'LINK']),
  titulo: z.string().trim().min(3, 'Título muy corto').max(120),
  descripcion: z.string().trim().max(500).optional(),
  url: z.string().trim().max(1000).optional(),
});
const patchSchema = z
  .object({
    titulo: z.string().trim().min(3).max(120).optional(),
    descripcion: z.string().trim().max(500).optional(),
    activo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No hay cambios para aplicar');
const idSchema = z.string().uuid('Identificador inválido');

function urlValida(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

// Convierte filas en objetos de respuesta, firmando las URLs de archivos
async function formatear(rows) {
  const paths = rows.filter((r) => r.archivo_path).map((r) => r.archivo_path);
  const firmadas = new Map();
  if (paths.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (error) throw error;
    data.forEach((d) => firmadas.set(d.path, d.signedUrl));
  }
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    titulo: r.titulo,
    descripcion: r.descripcion,
    activo: r.activo,
    url: r.archivo_path ? firmadas.get(r.archivo_path) ?? null : r.url,
    esArchivo: !!r.archivo_path,
    creadoEn: r.created_at,
  }));
}

// ---------- GET /api/help ----------
// Usuarios: solo contenido activo. Admin: ?todos=1 incluye inactivos.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    let q = supabase
      .from('help_content')
      .select('id, tipo, titulo, descripcion, url, archivo_path, activo, created_at')
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: false });
    if (!(req.query.todos === '1' && req.user.isAdmin)) q = q.eq('activo', true);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ contenido: await formatear(data) });
  })
);

// ---------- POST /api/help ----------
// multipart/form-data (con "archivo") o JSON (solo enlaces)
router.post(
  '/',
  requireAdmin,
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    const d = parse(createSchema, req.body);
    const file = req.file;
    const url = d.url || null;

    if (d.tipo === 'LINK') {
      if (file) throw new HttpError(400, 'Un enlace no lleva archivo adjunto', 'DATOS_INVALIDOS');
      if (!url || !urlValida(url)) throw new HttpError(400, 'Ingresa una URL válida (http o https)', 'URL_INVALIDA');
    } else {
      if (file && url) throw new HttpError(400, 'Envía un archivo o una URL, no ambos', 'DATOS_INVALIDOS');
      if (!file && !url) throw new HttpError(400, 'Adjunta un archivo o indica una URL', 'DATOS_INVALIDOS');
      if (url && !urlValida(url)) throw new HttpError(400, 'Ingresa una URL válida (http o https)', 'URL_INVALIDA');
      if (file && !MIME[d.tipo][file.mimetype]) {
        const ok = Object.values(MIME[d.tipo]).join(', ');
        throw new HttpError(400, `Tipo de archivo no permitido para ${d.tipo}. Formatos: ${ok}`, 'ARCHIVO_INVALIDO');
      }
    }

    let archivoPath = null;
    if (file) {
      archivoPath = `${req.user.tenantId}/${crypto.randomUUID()}.${MIME[d.tipo][file.mimetype]}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(archivoPath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (upErr) throw new HttpError(502, `No se pudo guardar el archivo: ${upErr.message}`, 'STORAGE');
    }

    const { data, error } = await supabase
      .from('help_content')
      .insert({
        tenant_id: req.user.tenantId,
        tipo: d.tipo,
        titulo: d.titulo,
        descripcion: d.descripcion || null,
        url: archivoPath ? null : url,
        archivo_path: archivoPath,
      })
      .select('id, tipo, titulo, descripcion, url, archivo_path, activo, created_at')
      .single();
    if (error) {
      if (archivoPath) await supabase.storage.from(BUCKET).remove([archivoPath]); // no dejar huérfanos
      throw error;
    }

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'AYUDA_CREADA',
      detalle: { id: data.id, tipo: d.tipo, titulo: d.titulo },
    });
    res.status(201).json({ contenido: (await formatear([data]))[0] });
  })
);

// ---------- PATCH /api/help/:id ----------
// Los contenidos no se borran: se desactivan
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const c = parse(patchSchema, req.body);

    const { data, error } = await supabase
      .from('help_content')
      .update(c)
      .eq('id', id)
      .eq('tenant_id', req.user.tenantId)
      .select('id, tipo, titulo, descripcion, url, archivo_path, activo, created_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Contenido no encontrado', 'NO_ENCONTRADO');

    await audit(req, { tenantId: req.user.tenantId, userId: req.user.id, accion: 'AYUDA_EDITADA', detalle: { id, ...c } });
    res.json({ contenido: (await formatear([data]))[0] });
  })
);

module.exports = router;