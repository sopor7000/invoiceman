import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Banner from '../components/Banner';

const REGLAS = [
  ['Al menos 10 caracteres', (s) => s.length >= 10],
  ['Una mayúscula', (s) => /[A-Z]/.test(s)],
  ['Una minúscula', (s) => /[a-z]/.test(s)],
  ['Un número', (s) => /[0-9]/.test(s)],
];

export default function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const tokenOk = /^[a-f0-9]{64}$/.test(token);

  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [busy, setBusy] = useState(false);

  const claveOk = REGLAS.every(([, f]) => f(nueva)) && nueva === repetir && nueva.length <= 72;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { token, nueva } });
      setListo(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  let contenido;
  if (!tokenOk) {
    contenido = (
      <>
        <div role="alert" className="alert-error">
          <p className="alert-title">Enlace no válido</p>
          <p>El enlace no es válido o está incompleto. Solicita uno nuevo.</p>
        </div>
        <Link to="/recuperar" className="btn-primary w-full">Solicitar un enlace nuevo</Link>
      </>
    );
  } else if (listo) {
    contenido = (
      <>
        <div role="status" className="alert-success">
          <p className="alert-title">Contraseña actualizada</p>
          <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
        </div>
        <Link to="/login" className="btn-primary w-full">Ir a iniciar sesión</Link>
      </>
    );
  } else {
    contenido = (
      <>
        {error && (
          <div role="alert" className="alert-error">
            <p className="alert-title">No pudimos restablecer tu contraseña</p>
            <p>{error}</p>
            <Link to="/recuperar" className="btn-link mt-1 inline-block text-sm">Solicitar un enlace nuevo</Link>
          </div>
        )}

        <div>
          <label htmlFor="nueva" className="label">Nueva contraseña</label>
          <input id="nueva" type="password" required autoComplete="new-password" className="field"
            value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>

        <div>
          <label htmlFor="repetir" className="label">Repite la nueva contraseña</label>
          <input id="repetir" type="password" required autoComplete="new-password" className="field"
            value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </div>

        <ul className="space-y-0.5 text-sm">
          {REGLAS.map(([txt, f]) => (
            <li key={txt} className={f(nueva) ? 'text-success' : 'text-muted'}>
              {f(nueva) ? '✓' : '○'} {txt}
            </li>
          ))}
          <li className={nueva && nueva === repetir ? 'text-success' : 'text-muted'}>
            {nueva && nueva === repetir ? '✓' : '○'} Las contraseñas coinciden
          </li>
        </ul>

        <button disabled={!claveOk || busy} className="btn-primary w-full">
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Banner />

      <main className="flex flex-1 items-center justify-center bg-linear-to-b from-surface-alt to-surface px-4 py-12">
        <form onSubmit={enviar} className="card w-full max-w-md space-y-5 shadow-lift">
          <div>
            <h1 className="page-title">Nueva contraseña</h1>
            <p className="text-muted">Crea una contraseña nueva para tu cuenta de InvoiceMan.</p>
          </div>

          {contenido}

          <Link to="/login" className="btn-link block text-center text-sm">
            Volver a iniciar sesión
          </Link>
        </form>
      </main>
    </div>
  );
}
