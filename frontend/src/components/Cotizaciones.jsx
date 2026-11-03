import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Spinner from './Spinner';
import { fechaHora } from '../utils';

// Solicitudes de cotización pendientes (más de 500 usuarios)
export default function Cotizaciones() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    api('/super/cotizaciones')
      .then((r) => setLista(r.cotizaciones.filter((c) => c.estado === 'PENDIENTE')))
      .catch((e) => { setError(e.message); setLista([]); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const atender = async (c) => {
    setError('');
    try {
      await api(`/super/cotizaciones/${c.id}`, { method: 'PATCH' });
    } catch (err) {
      setError(err.message);
    }
    cargar();
  };

  return (
    <section className="space-y-3">
      <h2 className="section-title">Solicitudes de cotización</h2>
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {lista === null ? <Spinner /> : lista.length === 0 ? (
        <p className="text-muted">No hay solicitudes pendientes.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((c) => (
            <div key={c.id} className="card space-y-3">
              <div>
                <h3 className="text-lg font-bold text-primary">{c.empresa ?? 'Compañía'}</h3>
                <p className="text-sm text-muted">
                  {c.solicitante ?? 'Usuario'}{c.correo && ` · ${c.correo}`} · {fechaHora(c.creadaEn)}
                </p>
              </div>
              <p className="whitespace-pre-line">{c.mensaje}</p>
              <div className="flex flex-wrap items-center gap-4">
                <Link to={`/super/empresa/${c.tenantId}`} className="btn-primary btn-sm">Asignar plan</Link>
                <button onClick={() => atender(c)} className="btn-gray btn-sm">Marcar atendida</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
