const supabase = require('./supabase');

// Registra acciones sensibles. Nunca debe tumbar la petición si falla.
async function audit(req, { tenantId = null, userId = null, accion, detalle = null }) {
  const { error } = await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    accion,
    detalle,
    ip: req.ip,
  });
  if (error) console.error('Error de auditoría:', error.message);
}

module.exports = audit;