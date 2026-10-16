import { useEffect, useState } from 'react';
import { api } from '../api/client';
import EstadoTag from '../components/EstadoTag';
import Spinner from '../components/Spinner';
import { cop, fechaHora } from '../utils';

const TIPO = { ELECTRONICA: 'Electrónica', MANUAL: 'Manual', EXTRANJERA: 'Extranjero' };

export default function MisSolicitudes() {
  const [vista, setVista] = useState('leg');
  const [estado, setEstado] = useState('');
  const [leg, setLeg] = useState(null);
  const [via, setVia] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setLeg(null);
    setVia(null);
    setError('');
    const q = estado ? `?estado=${estado}` : '';
    if (vista === 'leg') {
      api(`/legalizations/mine${q}`).then((r) => setLeg(r.legalizaciones)).catch((e) => { setError(e.message); setLeg([]); });
    } else {
      api(`/viaticos/mine${q}`).then((r) => setVia(r.items)).catch((e) => { setError(e.message); setVia([]); });
    }
  }, [vista, estado]);

  const descargar = async (id) => {
    try {
      const r = await api(`/legalizations/${id}/file`);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Mis solicitudes</h1>
        <p className="page-lead">Consulta el estado de tus legalizaciones y viáticos.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-2" role="tablist">
          <button role="tab" aria-selected={vista === 'leg'} onClick={() => setVista('leg')}
            className={vista === 'leg' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>Legalizaciones</button>
          <button role="tab" aria-selected={vista === 'via'} onClick={() => setVista('via')}
            className={vista === 'via' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>Viáticos</button>
        </div>
        <div>
          <label htmlFor="estado" className="label">Estado</label>
          <select id="estado" className="field" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="APROBADA">Aprobada</option>
            <option value="RECHAZADA">Rechazada</option>
          </select>
        </div>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

      {vista === 'leg' && (leg === null ? <Spinner /> : leg.length === 0 ? (
        <div className="alert-info"><p>No tienes legalizaciones{estado ? ' con ese estado' : ''}.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Comercio</th><th>Concepto</th><th>Valor</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {leg.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{fechaHora(l.creadaEn)}</td>
                  <td>{TIPO[l.tipo]}</td>
                  <td>
                    {l.nombreComercio}
                    <span className="block text-xs text-muted">NIT {l.nitComercio}</span>
                  </td>
                  <td>{l.concepto}</td>
                  <td className="whitespace-nowrap">
                    {cop(l.valor)}
                    {l.tipo === 'EXTRANJERA' && (
                      <span className="block text-xs text-muted">{l.valorOriginal} {l.moneda}</span>
                    )}
                  </td>
                  <td>
                    <EstadoTag estado={l.estado} />
                    {l.motivoRechazo && <span className="mt-1 block text-xs text-danger">{l.motivoRechazo}</span>}
                  </td>
                  <td>
                    {l.tieneArchivo && (
                      <button onClick={() => descargar(l.id)} className="btn-link text-sm">Ver soporte</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {vista === 'via' && (via === null ? <Spinner /> : via.length === 0 ? (
        <div className="alert-info"><p>No tienes solicitudes de viáticos{estado ? ' con ese estado' : ''}.</p></div>
      ) : (
        <div className="space-y-4">
          {via.map((v) => (
            <article key={v.id} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted">{fechaHora(v.creadaEn)}</p>
                  <p className="text-xl font-extrabold text-primary">{cop(v.total)}</p>
                </div>
                <EstadoTag estado={v.estado} />
              </div>
              {v.observacion && <p className="text-muted">{v.observacion}</p>}
              <ul className="divide-y divide-line text-sm">
                {v.items.map((i) => (
                  <li key={i.conceptId} className="flex justify-between py-1.5">
                    <span>{i.concepto}</span>
                    <span className="font-semibold">{cop(i.valor)}</span>
                  </li>
                ))}
              </ul>
              {v.motivoRechazo && (
                <div className="alert-error"><p><strong>Motivo del rechazo:</strong> {v.motivoRechazo}</p></div>
              )}
            </article>
          ))}
        </div>
      ))}
    </div>
  );
}