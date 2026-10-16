const crypto = require('crypto');

// Genera una clave temporal de 12 caracteres que cumple la política
// (mayúscula, minúscula y número) sin caracteres ambiguos (0/O, 1/l/I).
function generarClaveTemporal() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const L = 'abcdefghijkmnopqrstuvwxyz';
  const D = '23456789';
  const pick = (s) => s[crypto.randomInt(s.length)];

  const chars = [pick(U), pick(L), pick(D)];
  while (chars.length < 12) chars.push(pick(U + L + D));

  // Mezcla Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { generarClaveTemporal };