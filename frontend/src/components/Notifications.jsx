import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { fechaHora } from '../utils';

export default function Notifications() {
  const [data, setData] = useState(null);

  const cargar = () => api('/notifications').then(setData).catch(() => setData({ noLeidas: 0, notificaciones: [] }));
  useEffect(() => { cargar(); }, []);

  const leerTodas = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    cargar();
  };

  if (!data) return null;
  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="section-title flex-1">
          Notificaciones
          {data.noLeidas > 0 && <span className="tag-danger ml-2">{data.noLeidas} nuevas</span>}
        </h2>
      </div>
      {data.notificaciones.length === 0 ? (
        <p className="text-muted">No tienes notificaciones.</p>
      ) : (
        <>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {data.notificaciones.slice(0, 8).map((n) => (
              <li key={n.id} className={`py-2 ${n.leida ? 'text-muted' : 'font-semibold'}`}>
                <p>{n.mensaje}</p>
                <p className="text-xs font-normal text-muted">{fechaHora(n.fecha)}</p>
              </li>
            ))}
          </ul>
          {data.noLeidas > 0 && (
            <button onClick={leerTodas} className="btn-link mt-3 text-sm">Marcar todas como leídas</button>
          )}
        </>
      )}
    </section>
  );
}