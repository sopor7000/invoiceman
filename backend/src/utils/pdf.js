const PDFDocument = require('pdfkit');

const AZUL = '#0a3161';
const ROJO = '#b31942';
const GRIS = '#52606d';
const TINTA = '#1f2933';

const cop = (n) => `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
const fecha = (iso) =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'medium' });

// Escribe en `stream` el PDF de confirmación de una solicitud de viáticos
function generarPdfViatico(stream, d) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: 'Confirmación de solicitud de viáticos', Author: 'InvoiceMan' },
  });
  doc.pipe(stream);
  const ancho = doc.page.width - 100;

  const espacio = (alto) => {
    if (doc.y > doc.page.height - 60 - alto) doc.addPage();
  };
  const titulo = (t) => {
    espacio(90);
    doc.moveDown(0.9).font('Helvetica-Bold').fontSize(11).fillColor(AZUL).text(t.toUpperCase());
    const y = doc.y + 2;
    doc.moveTo(50, y).lineTo(50 + ancho, y).lineWidth(0.8).strokeColor('#cbd2d9').stroke();
    doc.y = y + 8;
    doc.fillColor(TINTA);
  };
  const dato = (k, v) => {
    espacio(20);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GRIS).text(`${k}: `, { continued: true });
    doc.font('Helvetica').fillColor(TINTA).text(String(v ?? '—'));
  };

  // Encabezado
  doc.rect(0, 0, doc.page.width, 72).fill(AZUL);
  doc.rect(0, 72, doc.page.width, 4).fill(ROJO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('InvoiceMan', 50, 22);
  doc.font('Helvetica').fontSize(10).text('Legalización de facturas y viáticos', 50, 49);
  doc.y = 100;

  doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(16).text('Confirmación de solicitud de viáticos', 50, 100);
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(`Referencia: ${d.id}`);

  titulo('Datos del solicitante');
  dato('Nombre', d.usuario.nombre);
  dato('Documento', `${d.usuario.tipo_doc} ${d.usuario.numero_doc}`);
  dato('Correo', d.usuario.email);
  dato('Compañía', `${d.compania.nombre} (NIT ${d.compania.nit})`);

  titulo('Detalle de la solicitud');
  dato('Fecha de la solicitud', fecha(d.creadaEn));
  dato('Estado actual', d.estado);
  if (d.observacion) dato('Observación', d.observacion);
  doc.moveDown(0.6);

  // Tabla de conceptos
  espacio(40);
  let y = doc.y;
  doc.rect(50, y, ancho, 20).fill('#e4e7eb');
  doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(10);
  doc.text('Concepto', 58, y + 5, { width: ancho - 160 });
  doc.text('Valor', 50 + ancho - 150, y + 5, { width: 142, align: 'right' });
  doc.y = y + 26;

  doc.font('Helvetica').fillColor(TINTA);
  for (const it of d.items) {
    espacio(24);
    y = doc.y;
    doc.fontSize(10).text(it.concepto || '—', 58, y, { width: ancho - 160 });
    const alto = doc.y - y;
    doc.text(cop(it.valor), 50 + ancho - 150, y, { width: 142, align: 'right' });
    doc.y = y + Math.max(alto, 14) + 6;
    doc.moveTo(50, doc.y - 3).lineTo(50 + ancho, doc.y - 3).lineWidth(0.4).strokeColor('#e4e7eb').stroke();
  }

  espacio(30);
  y = doc.y + 4;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(AZUL);
  doc.text('TOTAL SOLICITADO', 58, y, { width: ancho - 160 });
  doc.text(cop(d.total), 50 + ancho - 150, y, { width: 142, align: 'right' });
  doc.y = y + 24;
  doc.fillColor(TINTA);

  titulo('Condiciones aceptadas');
  doc.font('Helvetica').fontSize(10).fillColor(TINTA).text(d.disclaimer, 50, doc.y, { width: ancho, align: 'justify' });

  titulo('Confirmación de aceptación');
  espacio(110);
  const caja = doc.y;
  const texto =
    `El usuario ${d.usuario.nombre}, identificado con ${d.usuario.tipo_doc} ${d.usuario.numero_doc}, ` +
    `aceptó las condiciones anteriores el ${fecha(d.aceptadoEn)} (hora de Colombia). ` +
    `El presente documento es la confirmación de la aceptación de dichas condiciones y de lo solicitado ` +
    `por un valor total de ${cop(d.total)}.`;
  const altoCaja = doc.heightOfString(texto, { width: ancho - 24 }) + 24;
  doc.rect(50, caja, ancho, altoCaja).lineWidth(1).fillAndStroke('#f3f5f7', '#cbd2d9');
  doc.rect(50, caja, 5, altoCaja).fill(ROJO);
  doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10).text(texto, 64, caja + 12, { width: ancho - 24 });
  doc.y = caja + altoCaja + 14;

  doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(
    `Documento generado electrónicamente por InvoiceMan el ${fecha(new Date().toISOString())}.`,
    50, doc.y, { width: ancho }
  );

  doc.end();
}

module.exports = { generarPdfViatico };