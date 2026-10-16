const crypto = require('crypto');
const supabase = require('./supabase');
const { HttpError } = require('./errors');

const BUCKET = 'soportes';

// Detecta el tipo real por los primeros bytes
function detectarTipo(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

// Sube un soporte y devuelve { path, nombre }
async function subirSoporte(file, tenantId, userId) {
  const tipo = detectarTipo(file.buffer);
  if (!tipo) {
    throw new HttpError(400, 'El soporte debe ser un PDF o una imagen (JPG, PNG o WEBP)', 'ARCHIVO_INVALIDO');
  }
  const path = `${tenantId}/${userId}/${crypto.randomUUID()}.${tipo.ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: tipo.mime, upsert: false });
  if (error) throw new HttpError(502, `No se pudo guardar el archivo: ${error.message}`, 'STORAGE');

  const nombre = (file.originalname || `soporte.${tipo.ext}`).replace(/[\r\n"]/g, '').slice(0, 200);
  return { path, nombre };
}

async function borrarSoporte(path) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

async function urlFirmada(path, segundos = 300) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, segundos);
  if (error) throw new HttpError(502, 'No se pudo generar el enlace de descarga', 'STORAGE');
  return data.signedUrl;
}

module.exports = { subirSoporte, borrarSoporte, urlFirmada };
