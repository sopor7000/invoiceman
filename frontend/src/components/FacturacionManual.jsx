import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, descargar } from '../api/client';
import Spinner from './Spinner';
import { cop, fechaCO, hoyCO } from '../utils';

// Pagos sin factura y Excel para el contador (solo superadmin)
export default function FacturacionManual() {
  const [pagos, setPagos] = useState(null);
  const [desde, setDesde] = useState(() => `${hoyCO().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoyCO);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/super/pagos/pendientes-factura')
      .then((r) => setPagos(r.pagos))
      .catch((e) => { setError(e.message); setPagos([]); });
  }, []);

  const exportar = async () => {
    setError(''); setBusy(true);
    try {
      const q = new URLSearchParams();
      if (desde) q.set('desde', desde);
      if (hasta) q.set('hasta', hasta);
      await descargar(`/super/pagos/export?${q}`, `pagos_${hasta || hoyCO()}.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const n = pagos?.length ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="section-title">Facturación manual</h2>
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-2">
          <h3 className="text-lg font-bold text-primary">
            {pagos === null ? 'Pagos sin factura' : `${n} ${n === 1 ? 'pago' : 'pagos'} sin factura`}
          </h3>
          {pagos === null ? <Spinner /> : n === 0 ? (
            <p className="text-muted">Todos los pagos tienen factura registrada.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {pagos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{p.empresa ?? 'Compañía'}</p>
                    <p className="text-sm text-muted">
                      NIT {p.nit} · {cop(p.total)} · {p.meses} {p.meses === 1 ? 'mes' : 'meses'} · registrado el {fechaCO(p.creadoEn)}
                    </p>
                  </div>
                  <Link to={`/super/empresa/${p.tenantId}`} className="btn-link text-sm">Registrar factura</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-4">
          <h3 className="text-lg font-bold text-primary">Excel para el contador</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exp-desde" className="label">Desde</label>
              <input id="exp-desde" type="date" className="field" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <label htmlFor="exp-hasta" className="label">Hasta</label>
              <input id="exp-hasta" type="date" className="field" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <button type="button" disabled={busy} onClick={exportar} className="btn-primary w-full">
            {busy ? 'Generando…' : 'Descargar Excel para el contador'}
          </button>
          <span className="hint">Una fila por pago registrado en el rango, según la fecha de registro.</span>
        </div>
      </div>
    </section>
  );
}
