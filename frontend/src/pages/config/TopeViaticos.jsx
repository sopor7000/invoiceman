import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Spinner from '../../components/Spinner';
import { cop } from '../../utils';

export default function TopeViaticos() {
  const [actual, setActual] = useState(undefined);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/settings')
      .then((r) => { setActual(r.topeViaticos); setValor(r.topeViaticos ?? ''); })
      .catch((e) => { setError(e.message); setActual(null); });
  }, []);

  const guardar = async (topeViaticos) => {
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await api('/settings/viaticos', { method: 'PATCH', body: { topeViaticos } });
      setActual(r.topeViaticos);
      setValor(r.topeViaticos ?? '');
      setMsg(r.topeViaticos == null ? 'Se quitó el tope total.' : 'Tope total actualizado.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (actual === undefined) return <Spinner />;

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-muted">
        Define el valor máximo que puede sumar una solicitud de viáticos. Aplica a solicitudes nuevas; las ya creadas
        no cambian. Si además hay topes por concepto, se validan ambos.
      </p>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      <div className="alert-info">
        <p>Tope actual: <strong>{actual == null ? 'Sin tope' : cop(actual)}</strong></p>
      </div>

      <form
        className="card space-y-4"
        onSubmit={(e) => { e.preventDefault(); guardar(Number(valor)); }}
      >
        <div>
          <label htmlFor="tope" className="label">Tope total por solicitud (COP)</label>
          <input id="tope" type="number" required min="1" step="0.01" className="field"
            value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || !valor || Number(valor) <= 0} className="btn-primary">Guardar tope</button>
          <button type="button" disabled={busy || actual == null} onClick={() => guardar(null)}
            className="btn-secondary">Quitar tope</button>
        </div>
      </form>
    </div>
  );
}