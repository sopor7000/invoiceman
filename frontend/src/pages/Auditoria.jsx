import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Spinner from '../components/Spinner';
import { fechaHora, hoyCO } from '../utils';

const LIMITE = 25;
const SIN_FILTROS = { accion: '', usuarioId: '', desde: '', hasta: '' };

// Detalle en formato "clave: valor" (los objetos anidados como JSON corto)
function Detalle({ detalle }) {
  if (!detalle || typeof detalle !== 'object' || Object.keys(detalle).length === 0) {
    return <span className="text-muted">—</span>;
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {Object.entries(detalle).map(([k, v]) => (
        <li key={k} className="break-all">
          <span className="font-semibold">{k}:</span>{' '}
          {v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
        </li>
      ))}
    </ul>
  );
}

export default function Auditoria() {
  const [acciones, setAcciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [borrador, setBorrador] = useState(SIN_FILTROS);
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/audit/acciones').then((r) => setAcciones(r.acciones)).catch((e) => setError(e.message));
    api('/users').then((r) => setUsuarios(r.users)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(LIMITE) });
    Object.entries(filtros).forEach(([k, v]) => v && q.set(k, v));
    setDatos(null);
    api(`/audit?${q}`)
      .then(setDatos)
      .catch((e) => { setError(e.message); setDatos({ total: 0, page, limit: LIMITE, items: [] }); });
  }, [filtros, page]);

  const set = (k) => (e) => setBorrador({ ...borrador, [k]: e.target.value });

  const filtrar = (e) => {
    e.preventDefault();
    setError('');
    setPage(1);
    setFiltros({ ...borrador });
  };

  const limpiar = () => {
    setError('');
    setBorrador(SIN_FILTROS);
    setPage(1);
    setFiltros(SIN_FILTROS);
  };

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / LIMITE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Auditoría</h1>
        <p className="page-lead">Registro de las acciones realizadas en tu compañía.</p>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

      <form onSubmit={filtrar} className="card grid gap-4 md:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div>
          <label htmlFor="f-accion" className="label">Acción</label>
          <select id="f-accion" className="field" value={borrador.accion} onChange={set('accion')}>
            <option value="">Todas</option>
            {acciones.map((a) => <option key={a.accion} value={a.accion}>{a.etiqueta}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-usuario" className="label">Usuario</label>
          <select id="f-usuario" className="field" value={borrador.usuarioId} onChange={set('usuarioId')}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-desde" className="label">Desde</label>
          <input id="f-desde" type="date" max={hoyCO()} className="field" value={borrador.desde} onChange={set('desde')} />
        </div>
        <div>
          <label htmlFor="f-hasta" className="label">Hasta</label>
          <input id="f-hasta" type="date" max={hoyCO()} className="field" value={borrador.hasta} onChange={set('hasta')} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Filtrar</button>
          <button type="button" onClick={limpiar} className="btn-gray">Limpiar</button>
        </div>
      </form>

      {datos === null ? <Spinner /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr>
              </thead>
              <tbody>
                {datos.items.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-sm">{fechaHora(a.fecha)}</td>
                    <td>{a.usuario ?? <span className="text-muted">—</span>}</td>
                    <td className="font-semibold">{a.etiqueta}</td>
                    <td className="min-w-64"><Detalle detalle={a.detalle} /></td>
                    <td className="whitespace-nowrap text-sm">{a.ip ?? '—'}</td>
                  </tr>
                ))}
                {datos.items.length === 0 && (
                  <tr><td colSpan={5} className="text-muted">No hay registros con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Página {page} de {paginas} · {datos.total} registros</p>
            <div className="flex gap-2">
              <button className="btn-gray btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <button className="btn-gray btn-sm" disabled={page >= paginas} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
