const { HttpError } = require('./errors');

// Valida datos con un esquema de zod; si falla, responde 400 con el detalle
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detalle = result.error.issues.map((i) => i.message).join('; ');
    throw new HttpError(400, detalle, 'VALIDACION');
  }
  return result.data;
}

module.exports = { parse };