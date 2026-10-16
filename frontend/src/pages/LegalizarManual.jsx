import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import FileInput from '../components/FileInput';
import { cop, hoyCO } from '../utils';

export default function LegalizarManual() {
  const [conceptos, setConceptos] = useState([]);
  const [f, setF] = useState({ conceptId: '', valor: '', nitComercio: '', nombreComercio: '', fechaFactura: '' });
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/concepts?tipo=FACTURA').then((r) => setConceptos(r.concepts)).catch((e) => setError(e.message));
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (!archivo) return setError('Adjunta el soporte de la factura.');
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => form.append(k, v));
    form.append('archivo', archivo);
    setBusy(true);
    try {
      const r = await api('/legalizations/manual', { method: 'POST', form });
      setOk(r.legalizacion);
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
          <p>{ok.nombreComercio} por {cop(ok.valor)} quedó pendiente de revisión por el administrador.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/mis-solicitudes" className="btn-primary">Ver mis solicitudes</Link>
          <button className="btn-secondary" onClick={() => { setOk(null); setArchivo(null); setF({ conceptId: '', valor: '', nitComercio: '', nombreComercio: '', fechaFactura: '' }); }}>
            Legalizar otra
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">Factura manual</h1>
      <p className="page-lead">Carga el soporte y completa los datos de la factura.</p>

      <form onSubmit={enviar} className="card space-y-5">
        {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

        <FileInput file={archivo} onChange={setArchivo} />

        <div>
          <label htmlFor="concepto" className="label">Concepto</label>
          <select id="concepto" required className="field" value={f.conceptId} onChange={set('conceptId')}>
            <option value="">Selecciona un concepto</option>
            {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="valor" className="label">Valor (COP)</label>
            <input id="valor" type="number" required min="1" step="0.01" inputMode="decimal" className="field"
              value={f.valor} onChange={set('valor')} />
          </div>
          <div>
            <label htmlFor="fecha" className="label">Fecha de la factura</label>
            <input id="fecha" type="date" required max={hoyCO()} className="field"
              value={f.fechaFactura} onChange={set('fechaFactura')} />
          </div>
          <div>
            <label htmlFor="nit" className="label">NIT del comercio</label>
            <input id="nit" required className="field" placeholder="900123456-7"
              value={f.nitComercio} onChange={set('nitComercio')} />
          </div>
          <div>
            <label htmlFor="nombre" className="label">Nombre del comercio</label>
            <input id="nombre" required minLength={2} className="field"
              value={f.nombreComercio} onChange={set('nombreComercio')} />
          </div>
        </div>

        <div className="flex gap-3">
          <button disabled={busy} className="btn-primary">{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
          <Link to="/" className="btn-secondary">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}