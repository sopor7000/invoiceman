const MAPA = {
  APROBADA: ['tag-success', 'Aprobada'],
  RECHAZADA: ['tag-danger', 'Rechazada'],
  PENDIENTE: ['tag-warning', 'Pendiente'],
};

export default function EstadoTag({ estado }) {
  const [clase, texto] = MAPA[estado] || ['tag-neutral', estado];
  return <span className={clase}>{texto}</span>;
}