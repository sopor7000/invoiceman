// Pruebas de aislamiento entre empresas (fase 5.3).
//
// Uso (PowerShell, desde backend/, con el backend local encendido contra invoiceman-dev):
//   $env:ALLOW_TESTS = '1'
//   npm run test:aislamiento
//   Remove-Item Env:ALLOW_TESTS
//
// Crea dos empresas de prueba (A y B) con sus datos, verifica con el token de A que no se
// ve ni se modifica nada de B, y al final borra SOLO lo que creó, por sus identificadores.
// DEV_PROJECT_REF (el ref de invoiceman-dev) va en backend/.env. Nunca pongas ALLOW_TESTS en el VPS.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const crypto = require('crypto');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

function abortar(mensaje) {
  console.error(`No se ejecutaron las pruebas de aislamiento: ${mensaje}`);
  process.exit(1);
}

// ---------- Protecciones: antes de conectarse a nada ----------
if (process.env.ALLOW_TESTS !== '1') abortar('falta ALLOW_TESTS=1.');
if (process.env.NODE_ENV === 'production') abortar('NODE_ENV es production.');
const devRef = (process.env.DEV_PROJECT_REF || '').trim();
if (!devRef) abortar('falta DEV_PROJECT_REF en backend/.env.');
if (!(process.env.SUPABASE_URL || '').includes(devRef)) {
  abortar('SUPABASE_URL no apunta al proyecto de desarrollo (no contiene DEV_PROJECT_REF).');
}
const API = (process.env.TEST_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
let hostApi;
try {
  hostApi = new URL(API).hostname;
} catch {
  abortar('TEST_API_URL no es una URL válida.');
}
if (!['localhost', '127.0.0.1'].includes(hostApi)) abortar('TEST_API_URL debe apuntar a localhost o 127.0.0.1.');

// El cliente de servicio se carga en before(), después de comprobar que el backend responde
let supabase;

// ---------- Datos de la ejecución ----------
const RUN = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const PREFIJO = `PRUEBA-AISLAMIENTO ${RUN}`;
const correo = (quien) => `prueba-aislamiento-${RUN}-${quien}@example.com`;
const clave = () => `Pa1${crypto.randomBytes(12).toString('hex')}`;
const digitos = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 + crypto.randomInt(9) : crypto.randomInt(10))).join('');
const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');

// Todo lo que se crea queda aquí en el momento de crearse; la limpieza borra solo esto
const creados = {
  tenants: [],
  users: [],
  concepts: [],
  legalizations: [],
  viaticos: [],
  help: [],
  planRequests: [],
  archivos: [],
};

const empresas = {}; // A y B: ids, correos, claves y tokens
const superadmin = {};

// ---------- Utilidades ----------
async function api(token, metodo, ruta, cuerpo) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    // respuesta sin JSON
  }
  return { status: r.status, texto, json };
}

const resumen = (r) => `HTTP ${r.status}: ${r.texto.slice(0, 300)}`;

function sinError(resultado, que) {
  if (resultado.error) throw new Error(`${que}: ${resultado.error.code || ''} ${resultado.error.message}`);
  return resultado.data;
}

async function login(email, password) {
  const r = await api(null, 'POST', '/api/auth/login', { email, password });
  if (r.status !== 200 || !r.json?.token) {
    throw new Error(
      `No se pudo iniciar sesión con ${email} (${resumen(r)}). ¿El backend de TEST_API_URL apunta a invoiceman-dev?`
    );
  }
  return r.json.token;
}

// Valores que nunca deben aparecer en una respuesta pedida con el token de A.
// Los ids de audit_logs no van aquí (pueden ser números cortos); se comparan en la prueba de /api/audit.
function marcadoresB() {
  const b = empresas.B;
  return [
    b.tenantId,
    b.adminId,
    b.userId,
    b.conceptFacturaId,
    b.conceptViaticoId,
    b.legalizationId,
    b.viaticoId,
    b.helpId,
    b.planRequestId,
    b.adminEmail,
    b.userEmail,
    b.nit,
    b.nombre,
  ].filter(Boolean);
}

async function assertSinDatosDeB(r, que) {
  for (const m of marcadoresB()) {
    assert.ok(!r.texto.includes(m), `${que}: la respuesta contiene datos de la empresa B (${m})`);
  }
}

// ---------- Preparación ----------
async function crearEmpresa(letra) {
  const e = {
    letra,
    nombre: `${PREFIJO} ${letra}`,
    nit: digitos(10),
    adminEmail: correo(`${letra.toLowerCase()}-admin`),
    adminClave: clave(),
    userEmail: correo(`${letra.toLowerCase()}-usuario`),
    userClave: clave(),
  };
  empresas[letra] = e;

  // 1. Empresa y administrador
  const comp = sinError(
    await supabase.rpc('crear_compania', {
      p_nombre: e.nombre,
      p_nit: e.nit,
      p_admin: {
        tipo_doc: 'CC',
        numero_doc: digitos(10),
        nombre: `${PREFIJO} ${letra} Administrador`,
        email: e.adminEmail,
        password_hash: await bcrypt.hash(e.adminClave, 10),
      },
    }),
    `crear_compania ${letra}`
  );
  if (comp?.tenant_id) creados.tenants.push(comp.tenant_id);
  if (comp?.admin_id) creados.users.push(comp.admin_id);
  if (comp?.resultado === 'DUPLICADO' || !comp?.tenant_id) {
    throw new Error(`crear_compania ${letra} no creó la empresa (${comp?.resultado || 'sin respuesta'})`);
  }
  e.tenantId = comp.tenant_id;
  e.adminId = comp.admin_id;

  // 2. Administrador listo (también aprobador, para las rutas de viáticos)
  sinError(
    await supabase
      .from('users')
      .update({ must_change_password: false, acepto_datos_en: new Date().toISOString(), is_approver: true })
      .eq('id', e.adminId)
      .eq('tenant_id', e.tenantId),
    `preparar administrador ${letra}`
  );

  // 3. Usuario estándar
  const u = sinError(
    await supabase
      .from('users')
      .insert({
        tenant_id: e.tenantId,
        tipo_doc: 'CC',
        numero_doc: digitos(10),
        nombre: `${PREFIJO} ${letra} Usuario`,
        email: e.userEmail,
        password_hash: await bcrypt.hash(e.userClave, 10),
        must_change_password: false,
        acepto_datos_en: new Date().toISOString(),
      })
      .select('id')
      .single(),
    `crear usuario ${letra}`
  );
  creados.users.push(u.id);
  e.userId = u.id;

  // 4. Conceptos (factura para la legalización y viático para la solicitud)
  for (const tipo of ['FACTURA', 'VIATICO']) {
    const c = sinError(
      await supabase
        .from('concepts')
        .insert({ tenant_id: e.tenantId, nombre: `${PREFIJO} ${letra} ${tipo}`, tipo, tope_valor: null, orden: 0 })
        .select('id')
        .single(),
      `crear concepto ${tipo} ${letra}`
    );
    creados.concepts.push(c.id);
    if (tipo === 'FACTURA') e.conceptFacturaId = c.id;
    else e.conceptViaticoId = c.id;
  }

  // 5. Legalización manual con soporte
  const ruta = `${e.tenantId}/${e.userId}/${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('soportes')
    .upload(ruta, PDF_MINIMO, { contentType: 'application/pdf', upsert: false });
  if (upErr) throw new Error(`subir soporte ${letra}: ${upErr.message}`);
  creados.archivos.push(ruta);

  const valor = letra === 'A' ? 111111.11 : 222222.22;
  const l = sinError(
    await supabase
      .from('legalizations')
      .insert({
        tenant_id: e.tenantId,
        user_id: e.userId,
        tipo: 'MANUAL',
        estado: 'PENDIENTE',
        archivo_path: ruta,
        archivo_nombre: 'soporte-prueba.pdf',
        concept_id: e.conceptFacturaId,
        valor,
        valor_original: valor,
        moneda: 'COP',
        nit_comercio: digitos(9),
        nombre_comercio: `${PREFIJO} ${letra} Comercio`,
        fecha_factura: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single(),
    `crear legalización ${letra}`
  );
  creados.legalizations.push(l.id);
  e.legalizationId = l.id;

  // 6. Solicitud de viáticos
  const { obtenerDisclaimer } = require('../src/utils/disclaimer');
  const v = sinError(
    await supabase.rpc('crear_viatico', {
      p_tenant: e.tenantId,
      p_user: e.userId,
      p_items: [{ concept_id: e.conceptViaticoId, valor: 50000 }],
      p_observacion: `${PREFIJO} ${letra}`,
      p_disclaimer: (await obtenerDisclaimer(e.tenantId)).texto,
    }),
    `crear viático ${letra}`
  );
  if (!v?.id) throw new Error(`crear_viatico ${letra} no devolvió el id`);
  creados.viaticos.push(v.id);
  e.viaticoId = v.id;

  // 7. Contenido de ayuda
  const h = sinError(
    await supabase
      .from('help_content')
      .insert({
        tenant_id: e.tenantId,
        tipo: 'LINK',
        titulo: `${PREFIJO} ${letra} Ayuda`,
        descripcion: null,
        url: 'https://example.com',
        archivo_path: null,
      })
      .select('id')
      .single(),
    `crear ayuda ${letra}`
  );
  creados.help.push(h.id);
  e.helpId = h.id;

  // 8. Cotización
  const p = sinError(
    await supabase
      .from('plan_requests')
      .insert({ tenant_id: e.tenantId, user_id: e.adminId, mensaje: `${PREFIJO} ${letra} cotización` })
      .select('id')
      .single(),
    `crear cotización ${letra}`
  );
  creados.planRequests.push(p.id);
  e.planRequestId = p.id;
}

async function crearSuperadmin() {
  superadmin.email = correo('super');
  superadmin.clave = clave();
  const s = sinError(
    await supabase
      .from('users')
      .insert({
        tenant_id: null,
        tipo_doc: 'CC',
        numero_doc: digitos(10),
        nombre: `${PREFIJO} Superadmin`,
        email: superadmin.email,
        password_hash: await bcrypt.hash(superadmin.clave, 10),
        is_super_admin: true,
        is_admin: false,
        is_approver: false,
        activo: true,
        must_change_password: false,
        acepto_datos_en: new Date().toISOString(),
      })
      .select('id')
      .single(),
    'crear superadmin temporal'
  );
  creados.users.push(s.id);
  superadmin.id = s.id;
}

// Estado de los datos de B antes de los intentos de modificación
async function fotoB() {
  const b = empresas.B;
  const [l, v, u, c, h] = await Promise.all([
    supabase.from('legalizations').select('estado').eq('id', b.legalizationId).maybeSingle(),
    supabase.from('viatico_requests').select('estado').eq('id', b.viaticoId).maybeSingle(),
    supabase.from('users').select('nombre, password_hash, pwd_changed_at, activo').eq('id', b.userId).maybeSingle(),
    supabase.from('concepts').select('nombre, activo').eq('id', b.conceptFacturaId).maybeSingle(),
    supabase.from('help_content').select('titulo, activo').eq('id', b.helpId).maybeSingle(),
  ]);
  for (const r of [l, v, u, c, h]) if (r.error) throw r.error;
  return { legalizacion: l.data, viatico: v.data, usuario: u.data, concepto: c.data, ayuda: h.data };
}

before(async () => {
  try {
    const salud = await fetch(`${API}/api/health`);
    if (!salud.ok) throw new Error(`HTTP ${salud.status}`);
  } catch (e) {
    abortar(`el backend no responde en ${API} (${e.message}). Enciéndelo con npm run dev.`);
  }

  supabase = require('../src/utils/supabase');

  await crearEmpresa('A');
  await crearEmpresa('B');
  await crearSuperadmin();

  for (const e of [empresas.A, empresas.B]) {
    e.adminToken = await login(e.adminEmail, e.adminClave);
    e.userToken = await login(e.userEmail, e.userClave);
  }
  superadmin.token = await login(superadmin.email, superadmin.clave);
});

// ---------- Limpieza (también si algo falla) ----------
after(async () => {
  if (!supabase) return;
  const pendientes = [];

  async function borrar(tabla, columna, valores) {
    const ids = [...new Set(valores.filter(Boolean))];
    if (!ids.length) return;
    const { error } = await supabase.from(tabla).delete().in(columna, ids);
    if (error) pendientes.push(`${tabla} (${columna} en ${ids.join(', ')}): ${error.message}`);
  }

  if (creados.archivos.length) {
    const { error } = await supabase.storage.from('soportes').remove(creados.archivos);
    if (error) pendientes.push(`storage soportes (${creados.archivos.join(', ')}): ${error.message}`);
  }
  await borrar('viatico_items', 'request_id', creados.viaticos);
  await borrar('viatico_requests', 'id', creados.viaticos);
  await borrar('legalizations', 'id', creados.legalizations);
  await borrar('help_content', 'id', creados.help);
  await borrar('plan_requests', 'id', creados.planRequests);
  // Filas que el backend genera por su cuenta para las empresas y usuarios de prueba
  await borrar('notifications', 'tenant_id', creados.tenants);
  await borrar('audit_logs', 'tenant_id', creados.tenants);
  await borrar('audit_logs', 'user_id', creados.users);
  await borrar('concepts', 'id', creados.concepts);
  await borrar('concepts', 'tenant_id', creados.tenants);
  await borrar('tenant_settings', 'tenant_id', creados.tenants);
  await borrar('tenant_tier_prices', 'tenant_id', creados.tenants);
  await borrar('tenant_plan', 'tenant_id', creados.tenants);
  await borrar('users', 'id', creados.users);
  await borrar('tenants', 'id', creados.tenants);

  if (pendientes.length) {
    console.error('Limpieza incompleta. Quedaron estos datos de prueba:\n- ' + pendientes.join('\n- '));
  } else {
    console.log(`Limpieza completa (ejecución ${RUN}).`);
  }
});

// ---------- Aserciones ----------
test('1. Los listados de A solo contienen datos de A', async (t) => {
  const A = empresas.A;
  const ids = (lista) => (lista || []).map((x) => x.id);

  const casos = [
    { ruta: '/api/users', token: A.adminToken, propios: (j) => ids(j.users), esperados: [A.adminId, A.userId] },
    {
      ruta: '/api/concepts?todos=1',
      token: A.adminToken,
      propios: (j) => ids(j.concepts),
      esperados: [A.conceptFacturaId, A.conceptViaticoId],
    },
    { ruta: '/api/legalizations/mine', token: A.userToken, propios: (j) => ids(j.legalizaciones), esperados: [A.legalizationId] },
    { ruta: '/api/inbox', token: A.adminToken, enTexto: [A.legalizationId] },
    { ruta: '/api/inbox/summary', token: A.adminToken },
    { ruta: '/api/viaticos/mine', token: A.userToken, propios: (j) => ids(j.items), esperados: [A.viaticoId] },
    { ruta: '/api/viaticos/review', token: A.adminToken, propios: (j) => ids(j.items), esperados: [A.viaticoId] },
    { ruta: '/api/help?todos=1', token: A.adminToken, propios: (j) => ids(j.contenido), esperados: [A.helpId] },
    { ruta: '/api/dian/uploads', token: A.adminToken },
    { ruta: '/api/dian/attempts', token: A.adminToken },
    { ruta: '/api/stats/summary', token: A.adminToken },
    { ruta: '/api/plan', token: A.adminToken },
    { ruta: '/api/settings', token: A.adminToken },
  ];

  for (const c of casos) {
    await t.test(`GET ${c.ruta}`, async () => {
      const r = await api(c.token, 'GET', c.ruta);
      assert.equal(r.status, 200, resumen(r));
      await assertSinDatosDeB(r, c.ruta);
      if (c.propios) {
        const presentes = c.propios(r.json);
        for (const id of c.esperados) assert.ok(presentes.includes(id), `${c.ruta}: falta el dato propio de A ${id}`);
      }
      for (const id of c.enTexto || []) assert.ok(r.texto.includes(id), `${c.ruta}: falta el dato propio de A ${id}`);
    });
  }

  await t.test('GET /api/audit', async () => {
    const r = await api(A.adminToken, 'GET', '/api/audit?limit=100');
    assert.equal(r.status, 200, resumen(r));
    await assertSinDatosDeB(r, '/api/audit');

    const [deA, deB] = await Promise.all(
      [A.tenantId, empresas.B.tenantId].map(async (tenantId) => {
        const { data, error } = await supabase.from('audit_logs').select('id').eq('tenant_id', tenantId);
        if (error) throw error;
        return new Set(data.map((a) => String(a.id)));
      })
    );
    assert.ok(r.json.items.length > 0, '/api/audit: A debería tener al menos sus inicios de sesión');
    for (const it of r.json.items) {
      assert.ok(!deB.has(String(it.id)), `/api/audit: el registro ${it.id} es de la empresa B`);
      assert.ok(deA.has(String(it.id)), `/api/audit: el registro ${it.id} no pertenece a la empresa A`);
    }
  });

  await t.test('GET /api/audit/acciones', async () => {
    const r = await api(A.adminToken, 'GET', '/api/audit/acciones');
    assert.equal(r.status, 200, resumen(r));
    await assertSinDatosDeB(r, '/api/audit/acciones');

    const { data, error } = await supabase.from('audit_logs').select('accion').eq('tenant_id', A.tenantId);
    if (error) throw error;
    const esperadas = [...new Set(data.map((a) => a.accion).filter((a) => !a.startsWith('SUPER_')))].sort();
    const recibidas = r.json.acciones.map((a) => a.accion).sort();
    assert.deepEqual(recibidas, esperadas, '/api/audit/acciones: no coincide con las acciones de la empresa A');
  });
});

test('2. A no puede leer ni modificar datos de B por identificador', async (t) => {
  const A = empresas.A;
  const B = empresas.B;
  const antes = await fotoB();
  const motivo = { motivo: 'Prueba de aislamiento entre empresas' };

  const casos = [
    ['GET', `/api/legalizations/${B.legalizationId}/file`],
    ['PATCH', `/api/users/${B.userId}`, { nombre: 'Cambio indebido' }],
    ['POST', `/api/users/${B.userId}/reset-password`],
    ['PATCH', `/api/concepts/${B.conceptFacturaId}`, { nombre: 'Cambio indebido' }],
    ['PATCH', `/api/help/${B.helpId}`, { titulo: 'Cambio indebido' }],
    ['DELETE', `/api/help/${B.helpId}`],
    ['POST', `/api/inbox/${B.legalizationId}/approve`],
    ['POST', `/api/inbox/${B.legalizationId}/reject`, motivo],
    ['POST', `/api/viaticos/${B.viaticoId}/approve`],
    ['POST', `/api/viaticos/${B.viaticoId}/reject`, motivo],
  ];

  for (const [metodo, ruta, cuerpo] of casos) {
    await t.test(`${metodo} ${ruta}`, async () => {
      const r = await api(A.adminToken, metodo, ruta, cuerpo);
      assert.ok([403, 404].includes(r.status), `${metodo} ${ruta}: se esperaba 403 o 404 (${resumen(r)})`);
      await assertSinDatosDeB(r, `${metodo} ${ruta}`);
    });
  }

  await t.test('Los datos de B no cambiaron', async () => {
    const despues = await fotoB();
    assert.deepEqual(despues, antes);
    assert.equal(despues.legalizacion?.estado, 'PENDIENTE');
    assert.equal(despues.viatico?.estado, 'PENDIENTE');
    assert.equal(despues.ayuda?.activo, true);
  });
});

test('3. Un tenantId enviado por el cliente se ignora', async (t) => {
  const A = empresas.A;
  const B = empresas.B;

  for (const ruta of [`/api/users?tenantId=${B.tenantId}`, `/api/concepts?todos=1&tenantId=${B.tenantId}`]) {
    await t.test(`GET ${ruta}`, async () => {
      const r = await api(A.adminToken, 'GET', ruta);
      assert.equal(r.status, 200, resumen(r));
      // El tenantId de B va en la URL, no en la respuesta: se revisa el cuerpo
      await assertSinDatosDeB(r, ruta);
    });
  }

  await t.test('POST /api/concepts con tenantId de B en el cuerpo', async () => {
    const r = await api(A.adminToken, 'POST', '/api/concepts', {
      nombre: `${PREFIJO} A cuerpo con tenantId`,
      tipo: 'FACTURA',
      tenantId: B.tenantId,
      tenant_id: B.tenantId,
    });
    if (r.json?.concept?.id) creados.concepts.push(r.json.concept.id);
    assert.equal(r.status, 201, resumen(r));

    const { data, error } = await supabase.from('concepts').select('tenant_id').eq('id', r.json.concept.id).single();
    if (error) throw error;
    assert.equal(data.tenant_id, A.tenantId, 'El concepto quedó en una empresa distinta de A');
  });
});

test('4. Un administrador de empresa recibe 403 en /api/super', async (t) => {
  const A = empresas.A;
  const B = empresas.B;
  const casos = [
    ['GET', '/api/super/tenants'],
    ['GET', '/api/super/uso'],
    ['GET', '/api/super/cotizaciones'],
    ['GET', `/api/super/tenants/${B.tenantId}/plan`],
    ['POST', `/api/super/tenants/${B.tenantId}/enter`],
  ];
  for (const [metodo, ruta] of casos) {
    await t.test(`${metodo} ${ruta}`, async () => {
      const r = await api(A.adminToken, metodo, ruta);
      assert.equal(r.status, 403, resumen(r));
      await assertSinDatosDeB(r, ruta);
    });
  }
});

test('5. Un usuario estándar recibe 403 en rutas de administrador', async (t) => {
  const A = empresas.A;
  const casos = [
    ['GET', '/api/users'],
    ['GET', '/api/inbox'],
    ['GET', '/api/stats/summary'],
    ['GET', '/api/audit'],
    ['GET', '/api/audit/acciones'],
    ['GET', '/api/plan'],
    ['GET', '/api/dian/uploads'],
    ['GET', '/api/viaticos/review'],
    ['POST', '/api/concepts', { nombre: `${PREFIJO} A usuario estándar`, tipo: 'FACTURA' }],
  ];
  for (const [metodo, ruta, cuerpo] of casos) {
    await t.test(`${metodo} ${ruta}`, async () => {
      const r = await api(A.userToken, metodo, ruta, cuerpo);
      if (r.json?.concept?.id) creados.concepts.push(r.json.concept.id);
      assert.equal(r.status, 403, resumen(r));
    });
  }
});

test('7. La base rechaza una legalización con usuario de A y concepto de B', async () => {
  const A = empresas.A;
  const B = empresas.B;
  const { data, error } = await supabase
    .from('legalizations')
    .insert({
      tenant_id: A.tenantId,
      user_id: A.userId,
      tipo: 'MANUAL',
      estado: 'PENDIENTE',
      archivo_path: `${A.tenantId}/${A.userId}/no-existe.pdf`,
      archivo_nombre: 'no-existe.pdf',
      concept_id: B.conceptFacturaId,
      valor: 1000,
      valor_original: 1000,
      moneda: 'COP',
      nit_comercio: digitos(9),
      nombre_comercio: `${PREFIJO} FK cruzada`,
      fecha_factura: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .maybeSingle();
  if (data?.id) creados.legalizations.push(data.id);
  assert.ok(error, 'La base aceptó una legalización con un concepto de otra empresa');
  assert.equal(error.code, '23503', `Se esperaba un error de llave foránea (23503) y llegó ${error.code}: ${error.message}`);
});

test('8. El superadmin fuera de una empresa recibe SELECCIONE_COMPANIA', async (t) => {
  for (const ruta of ['/api/users', '/api/concepts', '/api/audit', '/api/legalizations/mine']) {
    await t.test(`GET ${ruta}`, async () => {
      const r = await api(superadmin.token, 'GET', ruta);
      assert.equal(r.status, 400, resumen(r));
      assert.equal(r.json?.code, 'SELECCIONE_COMPANIA', resumen(r));
    });
  }
});

// Va de última: desactiva la empresa B
test('6. Con la empresa desactivada, sus usuarios reciben 403', async (t) => {
  const B = empresas.B;
  sinError(await supabase.from('tenants').update({ activo: false }).eq('id', B.tenantId), 'desactivar empresa B');

  for (const [quien, token] of [
    ['administrador B', B.adminToken],
    ['usuario B', B.userToken],
  ]) {
    await t.test(`${quien} en GET /api/concepts`, async () => {
      const r = await api(token, 'GET', '/api/concepts');
      assert.equal(r.status, 403, resumen(r));
      assert.equal(r.json?.code, 'COMPANIA_INACTIVA', resumen(r));
    });
  }
});
