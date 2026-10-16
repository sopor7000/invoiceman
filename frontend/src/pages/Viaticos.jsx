import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Spinner from '../components/Spinner';
import { cop } from '../utils';

export default function Viaticos() {
  const [conceptos, setConceptos] = useState(null);
  const [tope, setTope] = useState(null);
  const [valores, setValores] = useState({});
  const [obs, setObs] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/concepts?tipo=VIATICO'), api('/settings')])
      .then(([c, s]) => {
        setConceptos(c.concepts);
        setTope(s.topeViaticos);
      })
      .catch((e) => {
        setConceptos([]);
        setError(e.message);
      });
  }, []);

  const lineas = useMemo(
    () =>
      (conceptos || []).map((c) => {
        const valor = Number(valores[c.id]) || 0;
        return { ...c, valor, excede: c.topeValor != null && valor > c.topeValor };
      }),
    [conceptos, valores]
  );

  const usadas = lineas.filter((l) => l.valor > 0);
  const total = Math.round(usadas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const excedeTotal = tope != null && total > tope;
  const hayExceso = lineas.some((l) => l.excede) || excedeTotal;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/viaticos', {
        method: 'POST',
        body: {
          observacion: obs.trim() || undefined,
          items: usadas.map((l) => ({ conceptId: l.id, valor: l.valor })),
        },
      });
      setOk(r.solicitud);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="alert-success">
          <p className="alert-title">Solicitud enviada</p>
          <p>Tu solicitud de viáticos por {cop(ok.total)} quedó pendiente de aprobación.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/mis-solicitudes" className="btn-primary">Ver mis solicitudes</Link>
          <button className="btn-secondary" onClick={() => { setOk(null); setValores({}); setObs(''); }}>
            Crear otra
          </button>
        </div>
      </div>
    );
  }

  if (conceptos === null) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">Solicitar viáticos</h1>
      <p className="page-lead">Indica un valor para cada concepto que necesites. Deja en blanco los que no uses.</p>

      <form onSubmit={enviar} className="card space-y-5">
        {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

        {tope != null && (
          <div className="alert-info">
            <p>Tope máximo por solicitud: <strong>{cop(tope)}</strong></p>
          </div>
        )}

        {conceptos.length === 0 ? (
          <div className="alert-warning"><p>No hay conceptos de viáticos disponibles. Contacta al administrador.</p></div>
        ) : (
          <div className="space-y-4">
            {lineas.map((l) => (
              <div key={l.id}>
                <label htmlFor={`c-${l.id}`} className="label">{l.nombre}</label>
                <input
                  id={`c-${l.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className={`field ${l.excede ? 'border-danger' : ''}`}
                  value={valores[l.id] ?? ''}
                  onChange={(e) => setValores({ ...valores, [l.id]: e.target.value })}
                  aria-invalid={l.excede}
                />
                {l.topeValor != null && (
                  <span className={`hint ${l.excede ? 'font-semibold text-danger' : ''}`}>
                    {l.excede ? `Supera el tope de este concepto: ` : 'Tope de este concepto: '}
                    {cop(l.topeValor)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <label htmlFor="obs" className="label">Observación (opcional)</label>
          <textarea id="obs" rows={2} maxLength={500} className="field" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>

        <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${excedeTotal ? 'bg-danger-bg' : 'bg-info-bg'}`}>
          <span className="font-bold">Total</span>
          <span className={`text-2xl font-extrabold ${excedeTotal ? 'text-danger' : 'text-primary'}`}>{cop(total)}</span>
        </div>
        {excedeTotal && (
          <p role="alert" className="text-sm font-semibold text-danger">
            El total supera el tope permitido por solicitud ({cop(tope)}).
          </p>
        )}

        <div className="flex gap-3">
          <button disabled={busy || usadas.length === 0 || hayExceso} className="btn-primary">
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
          <Link to="/" className="btn-secondary">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}