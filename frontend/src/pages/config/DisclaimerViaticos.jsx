import { useCallback, useEffect, useState } from 'react';
import { api, descargar } from '../../api/client';
import Spinner from '../../components/Spinner';
import { cop, fechaHora } from '../../utils';

const LIMITE = 15;

export default function DisclaimerViaticos() {
  const [texto, setTexto] = useState(null);
  const [personalizado, setPersonalizado] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [usuarios, setUsuarios] = useState([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [page, setPage] = useState(1);
  const [lista, setLista] = useState(null);

  useEffect(() => {
    api('/settings')
      .then((s) => { setTexto(s.disclaimerViaticos); setPersonalizado(s.disclaimerPersonalizado); })
      .catch((e) => { setError(e.message); setTexto(''); });
    api('/users').then((r) => setUsuarios(r.users)).catch(() => {});
  }, []);

  const cargarLista = useCallback(() => {
    setLista(null);
    const q = new URLSearchParams({ page, limit: LIMITE });
    if (usuarioId) q.set('usuarioId', usuarioId);
    api(`/viaticos/confirmations?${q}`)
      .then(setLista)
      .catch((e) => { setError(e.message); setLista({ items: [], total: 0 }); });
  }, [page, usuarioId]);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  const guardar = async (nuevo) => {
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await api('/settings/disclaimer-viaticos', { method: 'PUT', body: { texto: nuevo } });
      setTexto(r.disclaimerViaticos);
      setPersonalizado(r.disclaimerPersonalizado);
      setMsg(nuevo ? 'Disclaimer actualizado. Aplica a las solicitudes nuevas.' : 'Se restauró el texto por defecto.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pdf = (id) =>
    descargar(`/viaticos/${id}/pdf`, `confirmacion_viaticos_${id.slice(0, 8)}.pdf`).catch((e) => setError(e.message));

  if (texto === null) return <Spinner />;
  const paginas = lista ? Math.max(1, Math.ceil(lista.total / LIMITE)) : 1;

  return (
    <div className="space-y-8">
      <p className="text-muted">
        Este texto aparece en una ventana de confirmación cuando el usuario envía una solicitud de viáticos. Solo
        puede enviarla si pulsa el botón de aceptación. Cada solicitud conserva el texto exacto que el usuario aceptó,
        aunque después lo modifiques.
      </p>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      <section className="card space-y-4">
        <h3 className="section-title">Texto del disclaimer</h3>
        <div className="alert-info">
          <p>{personalizado ? 'Estás usando un texto personalizado.' : 'Estás usando el texto modelo por defecto. Revísalo con tu asesor jurídico.'}</p>
        </div>
        <div>
          <label htmlFor="dis" className="label">Condiciones que aceptará el usuario</label>
          <textarea id="dis" rows={12} maxLength={5000} className="field" value={texto}
            onChange={(e) => setTexto(e.target.value)} />
          <span className="hint">{texto.length} / 5.000 caracteres. Los saltos de línea se respetan.</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || texto.trim().length < 20} onClick={() => guardar(texto.trim())} className="btn-primary">
            {busy ? 'Guardando…' : 'Guardar disclaimer'}
          </button>
          <button disabled={busy || !personalizado} onClick={() => guardar('')} className="btn-secondary">
            Restaurar texto por defecto
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="section-title flex-1">Confirmaciones de viáticos (PDF)</h3>
          <div>
            <label htmlFor="cu" className="label">Usuario</label>
            <select id="cu" className="field" value={usuarioId} onChange={(e) => { setPage(1); setUsuarioId(e.target.value); }}>
              <option value="">Todos</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>

        {lista === null ? <Spinner /> : lista.items.length === 0 ? (
          <div className="alert-info"><p>No hay confirmaciones registradas con este filtro.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Usuario</th><th>Documento</th><th>Total</th><th>Estado</th><th>Aceptación</th><th /></tr>
              </thead>
              <tbody>
                {lista.items.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.usuario?.nombre}</td>
                    <td>{c.usuario?.documento}</td>
                    <td className="whitespace-nowrap">{cop(c.total)}</td>
                    <td>{c.estado}</td>
                    <td className="whitespace-nowrap">{fechaHora(c.aceptadoEn)}</td>
                    <td><button className="btn-secondary btn-sm" onClick={() => pdf(c.id)}>Descargar PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lista && lista.total > LIMITE && (
          <div className="flex items-center justify-between">
            <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
            <span className="text-sm text-muted">Página {page} de {paginas}</span>
            <button className="btn-secondary btn-sm" disabled={page >= paginas} onClick={() => setPage(page + 1)}>Siguiente →</button>
          </div>
        )}
      </section>
    </div>
  );
}