export const cop = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(n ?? 0);

export const fechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';

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