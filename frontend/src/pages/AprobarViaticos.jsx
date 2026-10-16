import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import EstadoTag from '../components/EstadoTag';
import RechazoModal from '../components/RechazoModal';
import Spinner from '../components/Spinner';
import { cop, fechaHora } from '../utils';

export default function AprobarViaticos() {
  const [estado, setEstado] = useState('PENDIENTE');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rechazando, setRechazando] = useState(null);

  const cargar = useCallback(() => {
    setDatos(null);
    api(`/viaticos/review?estado=${estado}`)
      .then(setDatos)
      .catch((e) => { setError(e.message); setDatos({ items: [], total: 0 }); });
  }, [estado]);

  useEffect(() => { cargar(); }, [cargar]);

  const resolver = async (id, accion, motivo) => {
    setError(''); setMsg('');
    try {
      await api(`/viaticos/${id}/${accion}`, { method: 'POST', body: motivo ? { motivo } : undefined });
      setMsg(accion === 'approve' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
    } catch (e) {
      setError(e.message);
    }
    setRechazando(null);
    cargar();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Aprobación de viáticos</h1>
          <p className="page-lead mb-0">Aprueba o rechaza las solicitudes de tu compañía.</p>
        </div>
        <div>
          <label htmlFor="ev" className="label">Estado</label>
          <select id="ev" className="field" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Aprobadas</option>
            <option value="RECHAZADA">Rechazadas</option>
          </select>
        </div>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      {datos === null ? <Spinner /> : datos.items.length === 0 ? (
        <div className="alert-info"><p>No hay solicitudes {estado === 'PENDIENTE' ? 'pendientes' : 'con ese estado'}.</p></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {datos.items.map((v) => (
            <article key={v.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-primary">{v.usuario?.nombre}</p>
                  <p className="text-sm text-muted">Doc. {v.usuario?.documento} · {fechaHora(v.creadaEn)}</p>
                </div>
                <EstadoTag estado={v.estado} />
              </div>
              <p className="text-3xl font-extrabold text-primary">{cop(v.total)}</p>
              {v.observacion && <p className="text-muted">“{v.observacion}”</p>}
              <ul className="divide-y divide-line text-sm">
                {v.items.map((i) => (
                  <li key={i.conceptId} className="flex justify-between py-1.5">
                    <span>{i.concepto}</span><span className="font-semibold">{cop(i.valor)}</span>
                  </li>
                ))}
              </ul>
              {v.motivoRechazo && <div className="alert-error"><p><strong>Motivo:</strong> {v.motivoRechazo}</p></div>}
              {v.estado === 'PENDIENTE' && (
                <div className="flex gap-3">
                  <button className="btn-primary" onClick={() => resolver(v.id, 'approve')}>Aprobar</button>
                  <button className="btn-danger" onClick={() => setRechazando(v.id)}>Rechazar</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {rechazando && (
        <RechazoModal titulo="Rechazar solicitud de viáticos" onCancel={() => setRechazando(null)}
          onConfirm={(motivo) => resolver(rechazando, 'reject', motivo)} />
      )}
    </div>
  );
}