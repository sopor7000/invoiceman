const nodemailer = require('nodemailer');

let transporte = null;

function obtenerTransporte() {
  if (!transporte) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporte;
}

// Envía un correo por SMTP. Sin SMTP_HOST: en desarrollo lo imprime en consola; en producción falla.
async function enviarCorreo({ para, asunto, texto, html }) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Falta SMTP_HOST: no se puede enviar correo en producción');
    }
    console.log(`[CORREO SIMULADO]\nPara: ${para}\nAsunto: ${asunto}\n\n${texto}\n`);
    return { simulado: true };
  }
  return obtenerTransporte().sendMail({ from: process.env.MAIL_FROM, to: para, subject: asunto, text: texto, html });
}

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Correo con el enlace para restablecer la contraseña (HTML y texto plano equivalente)
function plantillaRecuperacion({ nombre, enlace, minutos }) {
  const asunto = 'Restablece tu contraseña de InvoiceMan';

  const texto =
    `Hola, ${nombre}:\n\n` +
    'Recibimos una solicitud para restablecer tu contraseña de InvoiceMan.\n' +
    `Abre este enlace para crear una nueva (vence en ${minutos} minutos y solo sirve una vez):\n\n` +
    `${enlace}\n\n` +
    'Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.\n';

  const n = escapar(nombre);
  const e = escapar(enlace);
  const m = escapar(minutos);
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0a3161;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:bold">InvoiceMan</td></tr>
    <tr><td style="background:#b31942;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px">Hola, ${n}:</p>
      <p style="margin:0 0 20px">Recibimos una solicitud para restablecer tu contraseña de InvoiceMan.</p>
      <p style="margin:0 0 20px;text-align:center">
        <a href="${e}" style="display:inline-block;background:#b31942;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px">Restablecer contraseña</a>
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#52606d">El enlace vence en ${m} minutos y solo sirve una vez. Si el botón no funciona, copia esta dirección en tu navegador:</p>
      <p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${e}" style="color:#1d5199">${e}</a></p>
      <p style="margin:0;font-size:14px;color:#52606d">Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { asunto, texto, html };
}

module.exports = { enviarCorreo, plantillaRecuperacion };
