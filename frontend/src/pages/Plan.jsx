import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Spinner from '../components/Spinner';
import { ESTADO_PLAN, cop, fechaCO } from '../utils';

export default function Plan() {
  const [plan, setPlan] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api('/plan').then(setPlan).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const elegir = async (t) => {
    if (!window.confirm(`¿Cambiar al tramo de ${t.nombre}? El cambio es inmediato.`)) return;
    setError(''); setMsg(''); setBusy(true);
    try {
      setPlan(await api('/plan/tramo', { method: 'POST', body: { tramo: t.codigo } }));
      setMsg(`Listo: tu compañía ahora está en el tramo de ${t.nombre}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cotizar = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      await api('/plan/cotizacion', { method: 'POST', body: { mensaje: mensaje.trim() } });
      setMensaje('');
      setMsg('Recibimos tu solicitud de cotización. Te contactaremos pronto.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return error ? <div role="alert" className="alert-error"><p>{error}</p></div> : <Spinner />;
  }

  const { vigencia, usuariosActivos, limiteUsuarios, descuentoAnualPct } = plan;
  const uso = limiteUsuarios ? Math.min(100, Math.round((usuariosActivos / limiteUsuarios) * 100)) : 0;
  const estado = ESTADO_PLAN[vigencia?.estado] || ESTADO_PLAN.SIN_VIGENCIA;
  const tramos = plan.tramos.filter((t) => !t.cotizacionManual);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Plan</h1>
        <p className="page-lead">Consulta el uso de tu compañía y elige el tramo de usuarios que necesitas.</p>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div role="status" className="alert-success"><p>{msg}</p></div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-primary">Usuarios activos</h2>
          <p className="text-3xl font-extrabold text-ink">
            {usuariosActivos} <span className="text-lg font-semibold text-muted">de {limiteUsuarios ?? '—'}</span>
          </p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface" role="progressbar"
            aria-valuenow={uso} aria-valuemin={0} aria-valuemax={100} aria-label="Uso del cupo de usuarios">
            <div className={`h-full rounded-full ${uso >= 90 ? 'bg-flag' : 'bg-primary-light'}`} style={{ width: `${uso}%` }} />
          </div>
          <p className="text-sm text-muted">{uso} % del cupo de tu tramo.</p>
        </div>

        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-primary">Vigencia</h2>
          <span className={estado.tag}>{estado.texto}</span>
          {vigencia?.venceEn ? (
            <p className="text-ink">
              {vigencia.diasRestantes >= 0 ? 'Vence el ' : 'Venció el '}
              <strong>{fechaCO(vigencia.venceEn)}</strong>
              {vigencia.diasRestantes > 0 && ` (faltan ${vigencia.diasRestantes} días)`}
            </p>
          ) : (
            <p className="text-muted">Tu compañía aún no tiene fecha de vigencia.</p>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="section-title">Tramos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tramos.map((t) => (
            <div key={t.codigo} className={`card flex flex-col gap-3 ${t.actual ? 'border-2 border-primary' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-primary">{t.nombre}</h3>
                {t.actual && <span className="tag-success">Tu tramo</span>}
              </div>
              {t.precioMes !== null ? (
                <div>
                  <p className="text-2xl font-extrabold text-ink">{cop(t.precioMes)}<span className="text-base font-semibold text-muted"> / mes</span></p>
                  <p className="text-sm text-muted">IVA incluido</p>
                  {descuentoAnualPct > 0 && (
                    <p className="mt-1 text-sm font-semibold text-success">Pagando 12 meses: {descuentoAnualPct} % de descuento</p>
                  )}
                </div>
              ) : (
                <p className="text-lg font-semibold text-muted">Precio por definir</p>
              )}
              {!t.cabe && (
                <p className="text-sm text-danger">Tus {usuariosActivos} usuarios activos no caben en este tramo.</p>
              )}
              <button className="btn-primary mt-auto w-full" onClick={() => elegir(t)}
                disabled={busy || t.actual || !t.cabe || t.precioMes === null}>
                Elegir este tramo
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="section-title">Más de 500 usuarios</h2>
        {plan.tramoActual === 'T5' ? (
          <div className="card">
            <p>Tu compañía tiene un plan pactado de hasta <strong>{limiteUsuarios}</strong> usuarios activos.</p>
          </div>
        ) : (
          <form onSubmit={cotizar} className="card space-y-4">
            <p className="text-muted">
              Para más de 500 usuarios preparamos una cotización a la medida. Cuéntanos cuántos usuarios necesitas y
              cualquier detalle que debamos tener en cuenta.
            </p>
            <div>
              <label htmlFor="mensaje" className="label">Mensaje</label>
              <textarea id="mensaje" rows={4} required minLength={10} maxLength={1000} className="field"
                value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
              <span className="hint">Entre 10 y 1000 caracteres.</span>
            </div>
            <button disabled={busy} className="btn-primary">{busy ? 'Enviando…' : 'Solicitar cotización'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
