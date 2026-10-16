import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import EstadoTag from '../components/EstadoTag';
import RechazoModal from '../components/RechazoModal';
import Spinner from '../components/Spinner';
import { cop, fechaHora } from '../utils';

const TABS = [
  ['ELECTRONICA', 'Electrónicas'],
  ['MANUAL', 'Manuales'],
  ['EXTRANJERA', 'Extranjeras'],
];
const LIMITE = 15;

export default function Bandeja() {
  const [tipo, setTipo] = useState('MANUAL');
  const [f, setF] = useState({ estado: 'PENDIENTE', desde: '', hasta: '', usuarioId: '' });
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState(null);
  const [pend, setPend] = useState({});
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rechazando, setRechazando] = useState(null);

  const cargar = useCallback(() => {
    const q = new URLSearchParams({ tipo, page, limit: LIMITE });
    Object.entries(f).forEach(([k, v]) => v && q.set(k, v));
    setDatos(null);
    api(`/inbox?${q}`)
      .then(setDatos)
      .catch((e) => { setError(e.message); setDatos({ items: [], total: 0 }); });
    api('/inbox/summary').then((r) => setPend(r.pendientes)).catch(() => {});
  }, [tipo, f, page]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { api('/users').then((r) => setUsuarios(r.users)).catch(() => {}); }, []);

  const cambiarFiltro = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };

  const adjunto = async (id) => {
    try {
      const r = await api(`/legalizations/${id}/file`);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e.message); }
  };

  const resolver = async (id, accion, motivo) => {
    setError(''); setMsg('');
    try {
      await api(`/inbox/${id}/${accion}`, { method: 'POST', body: motivo ? { motivo } : undefined });
      setMsg(accion === 'approve' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
      setRechazando(null);
      cargar();
    } catch (e) {
      setError(e.message);
      setRechazando(null);
      cargar();
    }
  };

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / LIMITE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Bandeja de solicitudes</h1>
        <p className="page-lead">Revisa y resuelve las legalizaciones de tu compañía.</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={tipo === id}
            onClick={() => { setTipo(id); setPage(1); setMsg(''); }}
            className={tipo === id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
            {nombre}
            {id !== 'ELECTRONICA' && pend[id] > 0 && <span className="tag-danger ml-1">{pend[id]}</span>}
          </button>
        ))}
      </div>

      <div className="card grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="fe" className="label">Estado</label>
          <select id="fe" className="field" value={f.estado} onChange={cambiarFiltro('estado')}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="APROBADA">Aprobada</option>
            <option value="RECHAZADA">Rechazada</option>
          </select>
        </div>
        <div>
          <label htmlFor="fu" className="label">Usuario</label>
          <select id="fu" className="field" value={f.usuarioId} onChange={cambiarFiltro('usuarioId')}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fd" className="label">Desde</label>
          <input id="fd" type="date" className="field" value={f.desde} onChange={cambiarFiltro('desde')} />
        </div>
        <div>
          <label htmlFor="fh" className="label">Hasta</label>
          <input id="fh" type="date" className="field" value={f.hasta} onChange={cambiarFiltro('hasta')} />
        </div>
      </div>

      {tipo === 'ELECTRONICA' && (
        <div className="alert-info"><p>Las facturas electrónicas se aprueban automáticamente al validar el CUFE contra la base de la DIAN. Aquí solo se consultan.</p></div>
      )}
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      {datos === null ? <Spinner /> : datos.items.length === 0 ? (
        <div className="alert-info"><p>No hay solicitudes con estos filtros.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Usuario</th><th>Comercio</th><th>Concepto</th><th>Valor</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{fechaHora(l.creadaEn)}</td>
                  <td>{l.usuario?.nombre}<span className="block text-xs text-muted">{l.usuario?.documento}</span></td>
                  <td>
                    {l.nombreComercio}
                    <span className="block text-xs text-muted">NIT {l.nitComercio}{l.pais ? ` · ${l.pais}` : ''}</span>
                    {l.cufe && <span className="block max-w-[14rem] truncate font-mono text-xs text-muted" title={l.cufe}>CUFE {l.cufe}</span>}
                  </td>
                  <td>{l.concepto}</td>
                  <td className="whitespace-nowrap">
                    {cop(l.valor)}
                    {l.tipo === 'EXTRANJERA' && <span className="block text-xs text-muted">{l.valorOriginal} {l.moneda} · TRM {l.trm}</span>}
                  </td>
                  <td>
                    <EstadoTag estado={l.estado} />
                    {l.aprobacionAutomatica && <span className="block text-xs text-muted">Automática</span>}
                    {l.motivoRechazo && <span className="block text-xs text-danger">{l.motivoRechazo}</span>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {l.tieneArchivo && <button className="btn-secondary btn-sm" onClick={() => adjunto(l.id)}>Descargar</button>}
                      {l.revisable && (
                        <>
                          <button className="btn-primary btn-sm" onClick={() => resolver(l.id, 'approve')}>Aprobar</button>
                          <button className="btn-danger btn-sm" onClick={() => setRechazando(l.id)}>Rechazar</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && datos.total > LIMITE && (
        <div className="flex items-center justify-between">
          <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
          <span className="text-sm text-muted">Página {page} de {paginas} · {datos.total} solicitudes</span>
          <button className="btn-secondary btn-sm" disabled={page >= paginas} onClick={() => setPage(page + 1)}>Siguiente →</button>
        </div>
      )}

      {rechazando && (
        <RechazoModal titulo="Rechazar solicitud" onCancel={() => setRechazando(null)}
          onConfirm={(motivo) => resolver(rechazando, 'reject', motivo)} />
      )}
    </div>
  );
}