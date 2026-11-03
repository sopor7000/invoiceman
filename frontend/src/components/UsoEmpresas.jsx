import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Spinner from './Spinner';
import { ESTADO_PLAN, fechaCO, fechaHora } from '../utils';

function tamano(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / 1024 / 1024).toFixed(2)} GB`;
}

// Tabla de uso por compañía para el superadmin
export default function UsoEmpresas() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/super/uso').then((r) => setLista(r.empresas)).catch((e) => { setError(e.message); setLista([]); });
  }, []);

  return (
    <section className="space-y-3">
      <h2 className="section-title">Uso por empresa</h2>
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {lista === null ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Empresa</th><th>Tramo</th><th>Usuarios</th><th>Vigencia</th>
                <th>Solicitudes del mes</th><th>Almacenamiento</th><th>Última actividad</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const lleno = e.limite && e.usuariosActivos / e.limite >= 0.9;
                const estado = ESTADO_PLAN[e.estadoPlan] || ESTADO_PLAN.SIN_VIGENCIA;
                return (
                  <tr key={e.id} className={e.activo ? '' : 'opacity-60'}>
                    <td>
                      <p className="font-semibold">{e.nombre}</p>
                      <p className="text-sm text-muted">NIT {e.nit}</p>
                    </td>
                    <td>{e.tramo ?? '—'}</td>
                    <td className="whitespace-nowrap">
                      {lleno
                        ? <span className="tag-danger">{e.usuariosActivos} / {e.limite}</span>
                        : <>{e.usuariosActivos} / {e.limite ?? '—'}</>}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={estado.tag}>{estado.texto}</span>
                      {e.venceEn && <p className="mt-1 text-sm text-muted">{fechaCO(e.venceEn)}</p>}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {e.legalizacionesMes} legalizaciones<br />{e.viaticosMes} viáticos
                    </td>
                    <td className="whitespace-nowrap">{tamano(Number(e.almacenamientoBytes) || 0)}</td>
                    <td className="whitespace-nowrap text-sm">{e.ultimaActividad ? fechaHora(e.ultimaActividad) : '—'}</td>
                    <td className="whitespace-nowrap">
                      <Link to={`/super/empresa/${e.id}`} className="btn-link text-sm">Plan y precios</Link>
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && <tr><td colSpan={8} className="text-muted">Aún no hay compañías.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
