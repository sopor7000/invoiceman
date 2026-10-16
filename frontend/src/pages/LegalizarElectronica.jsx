import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import CameraScanner from '../components/CameraScanner';
import { cufeDeArchivo, extraerCufe } from '../qr';
import { cop, fechaHora } from '../utils';

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export default function LegalizarElectronica() {
  const nav = useNavigate();
  const [conceptos, setConceptos] = useState([]);
  const [conceptId, setConceptId] = useState('');
  const [cufe, setCufe] = useState('');
  const [modo, setModo] = useState('archivo'); // 'camara' | 'archivo'
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/concepts?tipo=FACTURA').then((r) => setConceptos(r.concepts)).catch((e) => setError(e.message));
  }, []);

  const cufeValido = /^[0-9a-f]{96}$/.test(cufe);

  const alDetectar = (texto) => {
    const c = extraerCufe(texto);
    if (c) {
      setCufe(c);
      setModo('archivo');
      setAviso('CUFE leído desde la cámara. Revisa y selecciona el concepto.');
      setError('');
    } else {
      setError('Se leyó un QR, pero no contiene un CUFE válido. Intenta con otro código.');
    }
  };

  const alElegirArchivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setError('');
    setAviso('');
    if (!f) return;
    if (!TIPOS.includes(f.type)) return setError('Formato no permitido. Usa PDF, JPG, PNG o WEBP.');
    if (f.size > 10 * 1024 * 1024) return setError('El archivo supera los 10 MB.');

    setLeyendo(true);
    try {
      const c = await cufeDeArchivo(f);
      if (c) {
        setCufe(c);
        setAviso('CUFE leído del archivo. Revisa y selecciona el concepto.');
      } else {
        setError('No encontramos un código QR con CUFE en el archivo. Prueba con una imagen más nítida o escribe el CUFE.');
      }
    } catch {
      setError('No se pudo leer el archivo. Prueba con otro o escribe el CUFE manualmente.');
    } finally {
      setLeyendo(false);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setResultado(null);
    setBusy(true);
    try {
      const r = await api('/legalizations/electronic', { method: 'POST', body: { cufe, conceptId } });
      setResultado({ tipo: 'APROBADA', datos: r.legalizacion });
    } catch (err) {
      if (err instanceof ApiError && err.data?.resultado === 'NO_ENCONTRADA') {
        nav('/ayuda', { state: { cufe } });
        return;
      }
      if (err instanceof ApiError && err.data?.resultado === 'DUPLICADA') {
        setResultado({ tipo: 'DUPLICADA', fecha: err.data.fecha });
      } else if (err instanceof ApiError && err.data?.resultado === 'NIT_NO_COINCIDE') {
        setResultado({ tipo: 'NIT_NO_COINCIDE' });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const reiniciar = () => {
    setResultado(null);
    setCufe('');
    setAviso('');
    setError('');
  };

  if (resultado?.tipo === 'APROBADA') {
    const d = resultado.datos;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="alert-success">
          <p className="alert-title">Factura legalizada y aprobada</p>
          <p>{d.nombreComercio} · NIT {d.nitComercio} por {cop(d.valor)}.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/mis-solicitudes" className="btn-primary">Ver mis solicitudes</Link>
          <button className="btn-secondary" onClick={reiniciar}>Legalizar otra</button>
        </div>
      </div>
    );
  }

  if (resultado?.tipo === 'DUPLICADA') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="alert-error">
          <p className="alert-title">Esta factura ya fue legalizada</p>
          <p>
            Se registró el {fechaHora(resultado.fecha) || 'anteriormente'}. Una factura solo puede legalizarse una vez.
          </p>
        </div>
        <button className="btn-secondary" onClick={reiniciar}>Intentar con otra factura</button>
      </div>
    );
  }

  if (resultado?.tipo === 'NIT_NO_COINCIDE') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="alert-error">
          <p className="alert-title">La factura no está a nombre de tu compañía</p>
          <p>El NIT del adquiriente no coincide con el de tu compañía. Verifica que sea la factura correcta.</p>
        </div>
        <button className="btn-secondary" onClick={reiniciar}>Intentar con otra factura</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">Factura electrónica</h1>
      <p className="page-lead">Lee el código QR de la factura para obtener el CUFE.</p>

      <form onSubmit={enviar} className="card space-y-6">
        {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
        {aviso && <div className="alert-success"><p>{aviso}</p></div>}

        <fieldset>
          <legend className="label">1. Obtén el CUFE</legend>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={modo === 'camara' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setModo(modo === 'camara' ? 'archivo' : 'camara')}>
              {modo === 'camara' ? 'Cerrar cámara' : 'Escanear con la cámara'}
            </button>
            <label className="btn-secondary cursor-pointer">
              {leyendo ? 'Leyendo…' : 'Cargar imagen o PDF'}
              <input type="file" className="sr-only" accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={alElegirArchivo} disabled={leyendo} />
            </label>
          </div>

          {modo === 'camara' && (
            <div className="mt-4">
              <CameraScanner onScan={alDetectar} onClose={() => setModo('archivo')} />
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="cufe" className="label">CUFE</label>
          <textarea id="cufe" rows={3} className="field font-mono text-sm" spellCheck={false}
            placeholder="Se completa solo al leer el QR. También puedes pegarlo aquí."
            value={cufe}
            onChange={(e) => setCufe(extraerCufe(e.target.value) || e.target.value.trim().toLowerCase())} />
          <span className="hint">
            {cufe
              ? cufeValido ? '✔ Formato válido (96 caracteres).' : `Faltan o sobran caracteres (${cufe.length} de 96).`
              : 'Son 96 caracteres hexadecimales.'}
          </span>
        </div>

        <div>
          <label htmlFor="concepto" className="label">2. Concepto</label>
          <select id="concepto" required className="field" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
            <option value="">Selecciona un concepto</option>
            {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div className="flex gap-3">
          <button disabled={busy || !cufeValido || !conceptId} className="btn-primary">
            {busy ? 'Validando…' : 'Legalizar factura'}
          </button>
          <Link to="/" className="btn-secondary">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}