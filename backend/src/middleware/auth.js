const supabase = require('../utils/supabase');
const { verifyToken } = require('../utils/jwt');
const { HttpError, asyncHandler } = require('../utils/errors');

const USER_COLUMNS =
  'id, tenant_id, tipo_doc, numero_doc, nombre, email, is_super_admin, is_admin, ' +
  'is_approver, must_change_password, acepto_datos_en, activo';

/**
 * Exige sesión válida y deja el usuario en req.user.
 * Por defecto también bloquea si el usuario debe cambiar su clave o aceptar
 * el tratamiento de datos. Las rutas /auth usan { allowPending: true }.
 */
function requireAuth(options = {}) {
  return asyncHandler(async (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'No autenticado', 'NO_TOKEN');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, 'Sesión inválida o expirada', 'BAD_TOKEN');
    }

    const { data: u, error } = await supabase
      .from('users')
      .select(USER_COLUMNS)
      .eq('id', payload.sub)
      .maybeSingle();
    if (error) throw error;
    if (!u || !u.activo) throw new HttpError(401, 'Usuario no disponible', 'USER_INACTIVE');

    // Compañía efectiva
    let tenant = null;
    if (u.is_super_admin) {
      if (payload.ten) {
        const { data } = await supabase
          .from('tenants')
          .select('id, nombre, nit, activo, validar_nit_receptor')
          .eq('id', payload.ten)
          .maybeSingle();
        if (!data || !data.activo) {
          throw new HttpError(403, 'Compañía no disponible', 'COMPANIA_INACTIVA');
        }
        tenant = data;
      }
    } else {
      const { data } = await supabase
        .from('tenants')
        .select('id, nombre, nit, activo, validar_nit_receptor')
        .eq('id', u.tenant_id)
        .maybeSingle();
      if (!data || !data.activo) {
        throw new HttpError(403, 'Tu compañía está inactiva', 'COMPANIA_INACTIVA');
      }
      tenant = data;
    }

    const impersonating = u.is_super_admin && !!tenant;

    req.user = {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      tipoDoc: u.tipo_doc,
      numeroDoc: u.numero_doc,
      tenantId: tenant ? tenant.id : null,
      tenant,
      isSuperAdmin: u.is_super_admin,
      impersonating,
      // El superadmin dentro de una compañía tiene todos los permisos
      isAdmin: impersonating ? true : u.is_admin,
      isApprover: impersonating ? true : u.is_approver,
      mustChangePassword: u.must_change_password,
      aceptoDatos: !!u.acepto_datos_en,
    };

    if (!options.allowPending) {
      if (req.user.mustChangePassword) {
        throw new HttpError(403, 'Debes cambiar tu contraseña', 'PASSWORD_CHANGE_REQUIRED');
      }
      if (!req.user.aceptoDatos) {
        throw new HttpError(403, 'Debes aceptar el tratamiento de datos', 'TERMS_REQUIRED');
      }
    }
    next();
  });
}

// Rutas que operan dentro de una compañía
function requireTenant(req, _res, next) {
  if (!req.user.tenantId) {
    return next(new HttpError(400, 'Selecciona una compañía primero', 'SELECCIONE_COMPANIA'));
  }
  next();
}

const requireAdmin = (req, _res, next) =>
  req.user.isAdmin ? next() : next(new HttpError(403, 'Requiere rol de administrador', 'FORBIDDEN'));

const requireApprover = (req, _res, next) =>
  req.user.isApprover ? next() : next(new HttpError(403, 'Requiere rol de aprobador', 'FORBIDDEN'));

const requireSuperAdmin = (req, _res, next) =>
  req.user.isSuperAdmin ? next() : next(new HttpError(403, 'Requiere rol de superadministrador', 'FORBIDDEN'));

module.exports = { requireAuth, requireTenant, requireAdmin, requireApprover, requireSuperAdmin };