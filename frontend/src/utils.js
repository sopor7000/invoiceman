export const cop = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(n ?? 0);

export const fechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';

// Solo la fecha, en hora de Colombia
export const fechaCO = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' }) : '';

// Etiqueta y estilo de cada estado de vigencia del plan
export const ESTADO_PLAN = {
  VIGENTE: { texto: 'Vigente', tag: 'tag-success' },
  POR_VENCER: { texto: 'Por vencer', tag: 'tag-warning' },
  GRACIA: { texto: 'En periodo de gracia', tag: 'tag-warning' },
  VENCIDO: { texto: 'Vencido', tag: 'tag-danger' },
  SIN_VIGENCIA: { texto: 'Sin vigencia', tag: 'tag-neutral' },
};

// Fecha de hoy en Colombia (AAAA-MM-DD), para el máximo de los campos de fecha
export const hoyCO = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
// CSV con BOM UTF-8 para que Excel respete las tildes
export function descargarCsv(nombre, filas) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const texto = '\ufeff' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}