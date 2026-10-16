const sanitizeHtml = require('sanitize-html');

const OPCIONES = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's',
    'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
  },
  // Único estilo permitido: alineación del texto
  allowedStyles: {
    '*': { 'text-align': [/^(left|right|center|justify)$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  // Todos los enlaces abren en pestaña nueva y sin acceso a la página de origen
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

// Devuelve HTML seguro. Si el contenido no tiene texto visible, devuelve ''.
function limpiarHtml(html) {
  const limpio = sanitizeHtml(String(html ?? ''), OPCIONES).trim();
  const texto = sanitizeHtml(limpio, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, '').trim();
  const tieneLineaSeparadora = /<hr\b/i.test(limpio);
  return texto || tieneLineaSeparadora ? limpio : '';
}

module.exports = { limpiarHtml };