const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { generarClaveTemporal } = require('../utils/password');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const TIPOS_DOC = ['CC', 'CE', 'PA', 'PEP', 'PPT', 'TI', 'NIT'];
const COLS = 'id, tipo_doc, numero_doc, nombre, email, is_admin, is_approver, activo, created_at';

const userSchema = z.object({
  tipoDoc: z.enum(['CC', 'CE', 'PA', 'PEP', 'PPT', 'TI', 'NIT']).default('CC'),
  numeroDoc: z.string().trim().regex(/^[A-Za-z0-9]{4,20}$/, 'Documento inválido (4 a 20 caracteres alfanuméricos)'),
  nombre: z.string().trim().min(2, 'Nombre muy corto').max(120),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
});

const patchSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    tipoDoc: z.enum(['CC', 'CE', 'PA', 'PEP', 'PPT', 'TI', 'NIT']).optional(),
    numeroDoc: z.string().trim().regex(/^[A-Za-z0-9]{4,20}$/, 'Documento inválido').optional(),
    email: z.string().trim().toLowerCase().email('Correo inválido').optional(),
    isAdmin: z.boolean().optional(),
    isApprover: z.boolean().optional(),
    activo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No hay cambios para aplicar');

const idSchema = z.string().uuid('Identificador inválido');

const fmt = (u) => ({
  id: u.id,
  tipoDoc: u.tipo_doc,
  numeroDoc: u.numero_doc,
  nombre: u.nombre,
  email: u.email,
  isAdmin: u.is_admin,
  isApprover: u.is_approver,
  activo: u.activo,
  creadoEn: u.created_at,
});

function mensajeDuplicado(error) {
  const m = `${error.message || ''} ${error.details || ''}`;
  if (m.includes('users_email')) return 'Ese correo ya está registrado';
  if (m.includes('users_doc')) return 'Ya existe un usuario con ese documento en la compañía';
  return 'Registro duplicado';
}

// Cuenta admins activos de la compañía, excluyendo opcionalmente a un usuario
async function adminsActivos(tenantId, excluirId = null) {
  let q = supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_admin', true)
    .eq('activo', true);
  if (excluirId) q = q.neq('id', excluirId);
  const { count, error } = await q;
  if (error) throw error;
  return count;
}

// ---------- GET /api/users ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('users')
      .select(COLS)
      .eq('tenant_id', req.user.tenantId)
      .order('nombre');
    if (error) throw error;
    res.json({ users: data.map(fmt) });
  })
);

// ---------- POST /api/users ----------
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = parse(userSchema, req.body);
    const passwordTemporal = generarClaveTemporal();

    const { data, error } = await supabase
      .from('users')
      .insert({
        tenant_id: req.user.tenantId,
        tipo_doc: d.tipoDoc,
        numero_doc: d.numeroDoc,
        nombre: d.nombre,
        email: d.email,
        password_hash: await bcrypt.hash(passwordTemporal, 10),
      })
      .select(COLS)
      .single();

    if (error) {
      if (error.code === '23505') throw new HttpError(409, mensajeDuplicado(error), 'DUPLICADO');
      throw error;
    }

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'USUARIO_CREADO',
      detalle: { usuario: data.id, email: data.email },
    });
    res.status(201).json({ user: fmt(data), passwordTemporal });
  })
);

// ---------- GET /api/users/template ----------
router.get(
  '/template',
  asyncHandler(async (_req, res) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Usuarios');
    ws.columns = [
      { header: 'tipo_documento', key: 'tipo', width: 18 },
      { header: 'numero_documento', key: 'num', width: 20 },
      { header: 'nombre', key: 'nombre', width: 32 },
      { header: 'email', key: 'email', width: 34 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({ tipo: 'CC', num: '1020304050', nombre: 'Ejemplo Pérez', email: 'ejemplo@empresa.com' });
    ws.getColumn('num').numFmt = '@'; // texto: conserva ceros a la izquierda

    const ayuda = wb.addWorksheet('Instrucciones');
    ayuda.getColumn(1).width = 90;
    [
      'Borra la fila de ejemplo antes de cargar.',
      `tipo_documento: ${TIPOS_DOC.join(', ')}.`,
      'numero_documento: de 4 a 20 caracteres, sin puntos ni espacios.',
      'email: debe ser único en todo el sistema.',
      'Máximo 500 filas por archivo.',
      'Todos los usuarios se crean con rol estándar; los roles se asignan después.',
    ].forEach((t) => ayuda.addRow([t]));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_usuarios.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  })
);

// ---------- POST /api/users/bulk ----------
const celda = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.text ?? v.result ?? '').trim();
  return String(v).trim();
};

router.post(
  '/bulk',
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Adjunta el archivo Excel en el campo "archivo"', 'SIN_ARCHIVO');

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.file.buffer);
    } catch {
      throw new HttpError(400, 'El archivo no es un Excel (.xlsx) válido', 'ARCHIVO_INVALIDO');
    }
    const ws = wb.getWorksheet('Usuarios') || wb.worksheets[0];
    if (!ws) throw new HttpError(400, 'El archivo no tiene hojas', 'ARCHIVO_INVALIDO');

    const filas = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const f = {
        fila: n,
        tipoDoc: (celda(row.getCell(1).value) || 'CC').toUpperCase(),
        numeroDoc: celda(row.getCell(2).value),
        nombre: celda(row.getCell(3).value),
        email: celda(row.getCell(4).value).toLowerCase(),
      };
      if (f.numeroDoc || f.nombre || f.email) filas.push(f);
    });

    if (filas.length === 0) throw new HttpError(400, 'El archivo no tiene filas de datos', 'SIN_FILAS');
    if (filas.length > 500) throw new HttpError(400, 'Máximo 500 filas por archivo', 'DEMASIADAS_FILAS');

    const errores = [];
    const validas = [];
    const vistosEmail = new Set();
    const vistosDoc = new Set();

    for (const f of filas) {
      const r = userSchema.safeParse(f);
      if (!r.success) {
        errores.push({ fila: f.fila, email: f.email, motivo: r.error.issues.map((i) => i.message).join('; ') });
        continue;
      }
      const d = r.data;
      if (vistosEmail.has(d.email)) {
        errores.push({ fila: f.fila, email: d.email, motivo: 'Correo repetido dentro del archivo' });
        continue;
      }
      if (vistosDoc.has(d.numeroDoc)) {
        errores.push({ fila: f.fila, email: d.email, motivo: 'Documento repetido dentro del archivo' });
        continue;
      }
      vistosEmail.add(d.email);
      vistosDoc.add(d.numeroDoc);
      validas.push({ fila: f.fila, ...d });
    }

    // Duplicados contra la base de datos
    const emails = validas.map((v) => v.email);
    const docs = validas.map((v) => v.numeroDoc);
    const [{ data: ex1, error: e1 }, { data: ex2, error: e2 }] = await Promise.all([
      emails.length
        ? supabase.from('users').select('email').in('email', emails)
        : Promise.resolve({ data: [] }),
      docs.length
        ? supabase.from('users').select('numero_doc').eq('tenant_id', req.user.tenantId).in('numero_doc', docs)
        : Promise.resolve({ data: [] }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const emailsExistentes = new Set((ex1 || []).map((x) => x.email.toLowerCase()));
    const docsExistentes = new Set((ex2 || []).map((x) => x.numero_doc));

    const crear = [];
    for (const v of validas) {
      if (emailsExistentes.has(v.email)) {
        errores.push({ fila: v.fila, email: v.email, motivo: 'El correo ya está registrado' });
      } else if (docsExistentes.has(v.numeroDoc)) {
        errores.push({ fila: v.fila, email: v.email, motivo: 'El documento ya existe en la compañía' });
      } else {
        crear.push(v);
      }
    }

    const creados = [];
    if (crear.length) {
      const claves = crear.map(() => generarClaveTemporal());
      const hashes = await Promise.all(claves.map((c) => bcrypt.hash(c, 10)));
      const { data, error } = await supabase
        .from('users')
        .insert(
          crear.map((v, i) => ({
            tenant_id: req.user.tenantId,
            tipo_doc: v.tipoDoc,
            numero_doc: v.numeroDoc,
            nombre: v.nombre,
            email: v.email,
            password_hash: hashes[i],
          }))
        )
        .select('id, email');
      if (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'Se detectó un duplicado durante la carga. Intenta de nuevo.', 'DUPLICADO');
        }
        throw error;
      }
      const porEmail = new Map(data.map((d) => [d.email, d.id]));
      crear.forEach((v, i) =>
        creados.push({ fila: v.fila, id: porEmail.get(v.email), email: v.email, nombre: v.nombre, passwordTemporal: claves[i] })
      );
    }

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'USUARIOS_CARGA_MASIVA',
      detalle: { leidas: filas.length, creados: creados.length, rechazadas: errores.length },
    });

    errores.sort((a, b) => a.fila - b.fila);
    res.status(creados.length ? 201 : 200).json({
      resumen: { leidas: filas.length, creados: creados.length, rechazadas: errores.length },
      creados,
      errores,
    });
  })
);

// ---------- PATCH /api/users/:id ----------
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const c = parse(patchSchema, req.body);
    const tenantId = req.user.tenantId;

    const { data: actual, error } = await supabase
      .from('users')
      .select(COLS)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!actual) throw new HttpError(404, 'Usuario no encontrado', 'NO_ENCONTRADO');

    const esYo = id === req.user.id;
    const quitaAdmin = c.isAdmin === false && actual.is_admin;
    const desactiva = c.activo === false && actual.activo;

    if (esYo && (quitaAdmin || desactiva)) {
      throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivarte a ti mismo', 'AUTOBLOQUEO');
    }
    if ((quitaAdmin || (desactiva && actual.is_admin)) && (await adminsActivos(tenantId, id)) === 0) {
      throw new HttpError(409, 'Debe existir al menos un administrador activo en la compañía', 'ULTIMO_ADMIN');
    }

    const cambios = {};
    if (c.nombre !== undefined) cambios.nombre = c.nombre;
    if (c.tipoDoc !== undefined) cambios.tipo_doc = c.tipoDoc;
    if (c.numeroDoc !== undefined) cambios.numero_doc = c.numeroDoc;
    if (c.email !== undefined) cambios.email = c.email;
    if (c.isAdmin !== undefined) cambios.is_admin = c.isAdmin;
    if (c.isApprover !== undefined) cambios.is_approver = c.isApprover;
    if (c.activo !== undefined) cambios.activo = c.activo;

    const { data, error: upErr } = await supabase
      .from('users')
      .update(cambios)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(COLS)
      .single();
    if (upErr) {
      if (upErr.code === '23505') throw new HttpError(409, mensajeDuplicado(upErr), 'DUPLICADO');
      throw upErr;
    }

    await audit(req, {
      tenantId,
      userId: req.user.id,
      accion: 'USUARIO_EDITADO',
      detalle: { usuario: id, cambios },
    });
    res.json({ user: fmt(data) });
  })
);

// ---------- POST /api/users/:id/reset-password ----------
router.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const passwordTemporal = generarClaveTemporal();

    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: await bcrypt.hash(passwordTemporal, 10), must_change_password: true })
      .eq('id', id)
      .eq('tenant_id', req.user.tenantId)
      .select('id, email')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Usuario no encontrado', 'NO_ENCONTRADO');

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'USUARIO_RESET_CLAVE',
      detalle: { usuario: id },
    });
    res.json({ email: data.email, passwordTemporal });
  })
);

module.exports = router;