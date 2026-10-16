const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET debe existir en el .env y tener al menos 32 caracteres');
}

// ten = compañía en la que el superadmin está "entrando" (opcional)
function signToken(userId, actingTenantId = null) {
  const payload = { sub: userId };
  if (actingTenantId) payload.ten = actingTenantId;
  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function verifyToken(token) {
  return jwt.verify(token, secret);
}

module.exports = { signToken, verifyToken };