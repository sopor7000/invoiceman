const express = require('express');
const multer = require('multer');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { subirSoporte, borrarSoporte, urlFirmada } = require('../utils/files');
const { requireAuth, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant);

// El superadmin entra a administrar: no pertenece a la compañía y no puede crear solicitudes
router.use((req, _res, next) => {
  if (req.method === 'POST' && req.user.isSuperAdmin) {
    return next(
      new HttpError(
        403,
        'El superadministrador no puede crear solicitudes. Ingresa con un usuario de la compañía.',
        'SUPER_NO_SOLICITA'
      )
    );
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// ---------- Esquemas ----------
const uuid = z.string().uuid('Identificador inválido');

const nitComercio = z
  .string()
  .trim()
  .transform((s) => s.split('-')[0].replace(/\D/g, ''))
  .refine((s) => /^[0-9]{5,15}$/.test(s), 'NIT del comercio inválido (5 a 15 dígitos)');

// Número positivo, tolerante a texto de formulario ("1250000.50")
const monto = (nombre) =>
  z.coerce
    .number({ invalid_type_error: `${nombre} inválido` })
    .positive(`${nombre} debe ser mayor que cero`)
    .max(1e12, `${nombre} demasiado grande`)
    .transform((n) => Math.round(n * 100) / 100);

const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)')
  .refine((s) => !isNaN(new Date(s)), 'Fecha inválida')
  .refine((s) => s >= '2000-01-01', 'Fecha demasiado antigua')
  .refine((s) => s <= hoy(), 'La fecha de la factura no puede ser futura');

const electronicaSchema = z.object({
  cufe: z.string().trim().toLowerCase().regex(/^[0-9a-f]{96}$/, 'CUFE inválido: deben ser 96 caracteres hexadecimales'),
  conceptId: uuid,
});

const manualSchema = z.object({
  conceptId: uuid,
  valor: monto('El valor'),
  nitComercio,
  nombreComercio: z.string().trim().min(2, 'Nombre del comercio muy corto').max(200),
  fechaFactura: fecha,
});

const extranjeraSchema = z.object({
  conceptId: uuid,
  valorOriginal: monto('El valor'),
  moneda: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Moneda inválida (código de 3 letras, ej. USD)'),
  trm: monto('La TRM'),
  pais: z.string().trim().min(2, 'Indica el país').max(80),
  nitComercio: z.string().trim().min(3, 'Indica el identificador del comercio').max(30), // el exterior no usa NIT colombiano
  nombreComercio: z.string().trim().min(2, 'Nombre del comercio muy corto').max(200),
  fechaFactura: fecha,
});

const listSchema = z.object({
  tipo: z.enum(['ELECTRONICA', 'MANUAL', 'EXTRANJERA']).optional(),
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']).optional(),
});

const COLS =
  'id, tipo, estado, cufe, nit_comercio, nombre_comercio, valor, valor_original, moneda, trm, pais, ' +
  'fecha_factura, archivo_nombre, aprobacion_automatica, motivo_rechazo, revisado_en, created_at, concept_id';

const fmt = (l, nombres) => ({
  id: l.id,
  tipo: l.tipo,
  estado: l.estado,
  cufe: l.cufe,
  nitComercio: l.nit_comercio,
  nombreComercio: l.nombre_comercio,
  valor: Number(l.valor),
  valorOriginal: l.valor_original == null ? null : Number(l.valor_original),
  moneda: l.moneda,
  trm: l.trm == null ? null : Number(l.trm),
  pais: l.pais,
  fechaFactura: l.fecha_factura,
  concepto: nombres?.get(l.concept_id) ?? null,
  tieneArchivo: !!l.archivo_nombre,
  archivoNombre: l.archivo_nombre,
  aprobacionAutomatica: l.aprobacion_automatica,
  motivoRechazo: l.motivo_rechazo,
  revisadoEn: l.revisado_en,
  creadaEn: l.created_at,
});

// Trae los nombres de concepto en una segunda consulta y formatea las filas
async function formatear(tenantId, rows) {
  const ids = [...new Set(rows.map((r) => r.concept_id))];
  const nombres = new Map();
  if (ids.length) {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, nombre')
      .eq('tenant_id', tenantId)
      .in('id', ids);
    if (error) throw error;
    data.forEach((c) => nombres.set(c.id, c.nombre));
  }
  return rows.map((r) => fmt(r, nombres));
}
async function conceptoFacturaValido(tenantId, conceptId) {
  const { data, error } = await supabase
    .from('concepts')
    .select('id')
    .eq('id', conceptId)
    .eq('tenant_id', tenantId)
    .eq('tipo', 'FACTURA')
    .eq('activo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(400, 'El concepto no existe o está inactivo', 'CONCEPTO_INVALIDO');
}

/// ---------- POST /api/legalizations/electronic ----------
router.post(
  '/electronic',
  asyncHandler(async (req, res) => {
    const d = parse(electronicaSchema, req.body);

    const { data, error } = await supabase.rpc('legalizar_electronica', {
      p_tenant: req.user.tenantId,
      p_user: req.user.id,
      p_cufe: d.cufe,
      p_concept: d.conceptId,
    });
    if (error) throw error;

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: `LEGALIZACION_ELECTRONICA_${data.resultado}`,
      detalle: { cufe: d.cufe },
    });

    switch (data.resultado) {
      case 'APROBADA': {
        const { data: l, error: e2 } = await supabase
          .from('legalizations')
          .select(COLS)
          .eq('id', data.id)
          .single();
        if (e2) throw e2;
        const [legalizacion] = await formatear(req.user.tenantId, [l]);
        return res.status(201).json({ resultado: 'APROBADA', legalizacion });
      }
      case 'DUPLICADA':
        return res.status(409).json({
          resultado: 'DUPLICADA',
          error: 'Esta factura ya fue legalizada',
          code: 'DUPLICADA',
          fecha: data.fecha ?? null,
        });
      case 'NO_ENCONTRADA':
        return res.status(404).json({
          resultado: 'NO_ENCONTRADA',
          error: 'No encontramos esta factura en la base de la DIAN cargada por tu compañía',
          code: 'NO_ENCONTRADA',
          redirigir: '/ayuda',
        });
      case 'NIT_NO_COINCIDE':
        return res.status(422).json({
          resultado: 'NIT_NO_COINCIDE',
          error: 'La factura no está expedida a nombre de tu compañía',
          code: 'NIT_NO_COINCIDE',
        });
      case 'CUFE_INVALIDO':
        throw new HttpError(400, 'CUFE inválido', 'CUFE_INVALIDO');
      case 'CONCEPTO_INVALIDO':
        throw new HttpError(400, 'El concepto no existe o está inactivo', 'CONCEPTO_INVALIDO');
      default:
        throw new HttpError(403, 'Compañía no disponible', 'COMPANIA_INACTIVA');
    }
  })
);

// Crea una legalización con soporte (manual o extranjera)
async function crearConSoporte(req, res, tipo, campos) {
  if (!req.file) throw new HttpError(400, 'Adjunta el soporte (PDF o imagen) en el campo "archivo"', 'SIN_ARCHIVO');
  await conceptoFacturaValido(req.user.tenantId, campos.concept_id);

  const { path, nombre } = await subirSoporte(req.file, req.user.tenantId, req.user.id);

  const { data, error } = await supabase
    .from('legalizations')
    .insert({
      tenant_id: req.user.tenantId,
      user_id: req.user.id,
      tipo,
      estado: 'PENDIENTE',
      archivo_path: path,
      archivo_nombre: nombre,
      ...campos,
    })
    .select(COLS)
    .single();
  if (error) {
    await borrarSoporte(path); // no dejar huérfanos
    throw error;
  }

  await audit(req, {
    tenantId: req.user.tenantId,
    userId: req.user.id,
    accion: `LEGALIZACION_${tipo}_CREADA`,
    detalle: { id: data.id, valor: data.valor },
  });
  res.status(201).json({ legalizacion: (await formatear(req.user.tenantId, [data]))[0] });
}

// ---------- POST /api/legalizations/manual ----------
router.post(
  '/manual',
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    const d = parse(manualSchema, req.body);
    await crearConSoporte(req, res, 'MANUAL', {
      concept_id: d.conceptId,
      valor: d.valor,
      valor_original: d.valor,
      moneda: 'COP',
      nit_comercio: d.nitComercio,
      nombre_comercio: d.nombreComercio,
      fecha_factura: d.fechaFactura,
    });
  })
);

// ---------- POST /api/legalizations/foreign ----------
router.post(
  '/foreign',
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    const d = parse(extranjeraSchema, req.body);
    const valorCop = Math.round(d.valorOriginal * d.trm * 100) / 100;
    if (valorCop > 1e12) throw new HttpError(400, 'El valor convertido es demasiado grande', 'VALOR_INVALIDO');

    await crearConSoporte(req, res, 'EXTRANJERA', {
      concept_id: d.conceptId,
      valor: valorCop,
      valor_original: d.valorOriginal,
      moneda: d.moneda,
      trm: d.trm,
      pais: d.pais,
      nit_comercio: d.nitComercio,
      nombre_comercio: d.nombreComercio,
      fecha_factura: d.fechaFactura,
    });
  })
);

// ---------- GET /api/legalizations/mine ----------
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const f = parse(listSchema, {
      tipo: req.query.tipo || undefined,
      estado: req.query.estado || undefined,
    });

    let q = supabase
      .from('legalizations')
      .select(COLS)
      .eq('tenant_id', req.user.tenantId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (f.estado) q = q.eq('estado', f.estado);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ legalizaciones: await formatear(req.user.tenantId, data) });
  })
);

// ---------- GET /api/legalizations/:id/file ----------
// El dueño de la solicitud o un admin de la compañía. Devuelve URL firmada (5 min).
router.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const id = parse(uuid, req.params.id);

    const { data, error } = await supabase
      .from('legalizations')
      .select('user_id, archivo_path, archivo_nombre')
      .eq('id', id)
      .eq('tenant_id', req.user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Solicitud no encontrada', 'NO_ENCONTRADA');
    if (data.user_id !== req.user.id && !req.user.isAdmin) {
      throw new HttpError(403, 'No tienes acceso a este soporte', 'FORBIDDEN');
    }
    if (!data.archivo_path) throw new HttpError(404, 'Esta solicitud no tiene soporte adjunto', 'SIN_ARCHIVO');

    await audit(req, { tenantId: req.user.tenantId, userId: req.user.id, accion: 'SOPORTE_DESCARGADO', detalle: { id } });
    res.json({ url: await urlFirmada(data.archivo_path), nombre: data.archivo_nombre, expiraEnSegundos: 300 });
  })
);

module.exports = router;