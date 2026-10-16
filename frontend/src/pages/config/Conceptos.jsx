import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import Spinner from '../../components/Spinner';

function Fila({ c, esViatico, idx, total, onSave, onMove }) {
  const [nombre, setNombre] = useState(c.nombre);
  const [tope, setTope] = useState(c.topeValor ?? '');
  const [busy, setBusy] = useState(false);

  const topeNuevo = tope === '' ? null : Number(tope);
  const cambio = nombre.trim() !== c.nombre || (esViatico && topeNuevo !== c.topeValor);

  const guardar = async () => {
    setBusy(true);
    const cambios = { nombre: nombre.trim() };
    if (esViatico) cambios.topeValor = topeNuevo;
    await onSave(c.id, cambios);
    setBusy(false);
  };

  return (
    <tr className={c.activo ? '' : 'opacity-60'}>
      <td>
        <div className="flex flex-col">
          <button type="button" disabled={idx === 0} onClick={() => onMove(idx, -1)}
            className="btn-link text-xs disabled:opacity-30" aria-label={`Subir ${c.nombre}`}>▲</button>
          <button type="button" disabled={idx === total - 1} onClick={() => onMove(idx, 1)}
            className="btn-link text-xs disabled:opacity-30" aria-label={`Bajar ${c.nombre}`}>▼</button>
        </div>
      </td>
      <td>
        <input className="field" value={nombre} minLength={2} maxLength={80}
          onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del concepto" />
      </td>
      {esViatico && (
        <td>
          <input className="field" type="number" min="1" step="0.01" placeholder="Sin tope"
            value={tope} onChange={(e) => setTope(e.target.value)} aria-label="Tope por concepto" />
        </td>
      )}
      <td>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={c.activo}
            onChange={(e) => onSave(c.id, { activo: e.target.checked })} />
          {c.activo ? 'Activo' : 'Inactivo'}
        </label>
      </td>
      <td>
        <button type="button" disabled={!cambio || busy || nombre.trim().length < 2}
          onClick={guardar} className="btn-primary btn-sm">
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </td>
    </tr>
  );
}

export default function Conceptos({ tipo }) {
  const esViatico = tipo === 'VIATICO';
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [nuevo, setNuevo] = useState({ nombre: '', tope: '' });

  const cargar = useCallback(() => {
    api(`/concepts?tipo=${tipo}&todos=1`)
      .then((r) => setLista(r.concepts))
      .catch((e) => { setError(e.message); setLista([]); });
  }, [tipo]);

  useEffect(() => { setLista(null); cargar(); }, [cargar]);

  const guardar = async (id, cambios) => {
    setError(''); setMsg('');
    try {
      await api(`/concepts/${id}`, { method: 'PATCH', body: cambios });
      setMsg('Cambios guardados.');
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const mover = async (idx, dir) => {
    setError(''); setMsg('');
    const arr = [...lista];
    const j = idx + dir;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    try {
      await Promise.all(
        arr.map((c, i) => (c.orden !== i ? api(`/concepts/${c.id}`, { method: 'PATCH', body: { orden: i } }) : null))
      );
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const crear = async (e) => {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      const body = { nombre: nuevo.nombre.trim(), tipo, orden: lista.length };
      if (esViatico && nuevo.tope !== '') body.topeValor = Number(nuevo.tope);
      await api('/concepts', { method: 'POST', body });
      setNuevo({ nombre: '', tope: '' });
      setMsg('Concepto creado.');
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-muted">
        {esViatico
          ? 'Estos conceptos aparecen en la solicitud de viáticos. Puedes fijar un tope de valor por concepto.'
          : 'Estos conceptos aparecen al legalizar facturas (electrónicas, manuales y del extranjero).'}{' '}
        Los conceptos no se eliminan: si ya no se usan, desactívalos. El historial conserva su nombre.
      </p>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      {lista === null ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">Orden</th>
                <th>Nombre</th>
                {esViatico && <th>Tope por concepto (COP)</th>}
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => (
                <Fila key={`${c.id}-${c.nombre}-${c.topeValor}-${c.activo}`} c={c} esViatico={esViatico}
                  idx={i} total={lista.length} onSave={guardar} onMove={mover} />
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={esViatico ? 5 : 4} className="text-muted">No hay conceptos todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={crear} className="card space-y-4">
        <h3 className="section-title">Agregar concepto</h3>
        <div className={`grid gap-4 ${esViatico ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <div className={esViatico ? 'sm:col-span-1' : ''}>
            <label htmlFor={`nuevo-${tipo}`} className="label">Nombre</label>
            <input id={`nuevo-${tipo}`} required minLength={2} maxLength={80} className="field"
              value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </div>
          {esViatico && (
            <div>
              <label htmlFor="nuevo-tope" className="label">Tope (opcional)</label>
              <input id="nuevo-tope" type="number" min="1" step="0.01" className="field" placeholder="Sin tope"
                value={nuevo.tope} onChange={(e) => setNuevo({ ...nuevo, tope: e.target.value })} />
            </div>
          )}
          <div className="flex items-end">
            <button className="btn-red">Agregar</button>
          </div>
        </div>
      </form>
    </div>
  );
}