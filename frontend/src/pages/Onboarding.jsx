import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import Banner from '../components/Banner';

const REGLAS = [
  ['Al menos 10 caracteres', (s) => s.length >= 10],
  ['Una mayúscula', (s) => /[A-Z]/.test(s)],
  ['Una minúscula', (s) => /[a-z]/.test(s)],
  ['Un número', (s) => /[0-9]/.test(s)],
];

export default function Onboarding() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  const { cambiarClave, aceptarDatos } = user.pendientes;
  if (!cambiarClave && !aceptarDatos) return <Navigate to="/" replace />;

  const claveOk = REGLAS.every(([, f]) => f(nueva)) && nueva === repetir && nueva.length <= 72;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (cambiarClave) {
        await api('/auth/change-password', { method: 'POST', body: { actual, nueva } });
      }
      if (aceptarDatos) {
        await api('/auth/accept-terms', { method: 'POST' });
      }
      await refresh();
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const habilitado = (!cambiarClave || claveOk) && (!aceptarDatos || acepta);

  return (
    <div className="flex min-h-screen flex-col">
      <Banner />

      <main className="flex flex-1 items-center justify-center bg-linear-to-b from-surface-alt to-surface px-4 py-12">
        <form onSubmit={enviar} className="card w-full max-w-md space-y-5 shadow-lift">
          <div>
            <h1 className="page-title">Bienvenido, {user.nombre}</h1>
            <p className="text-muted">Antes de continuar necesitamos completar estos pasos.</p>
          </div>
  
          {cambiarClave && (
            <fieldset className="space-y-3">
              <legend className="mb-3 text-lg font-bold text-primary">1. Cambia tu contraseña temporal</legend>
              <input type="password" required autoComplete="current-password" placeholder="Contraseña actual"
                value={actual} onChange={(e) => setActual(e.target.value)}
                className="field" />
              <input type="password" required autoComplete="new-password" placeholder="Nueva contraseña"
                value={nueva} onChange={(e) => setNueva(e.target.value)}
                className="field" />
              <input type="password" required autoComplete="new-password" placeholder="Repite la nueva contraseña"
                value={repetir} onChange={(e) => setRepetir(e.target.value)}
                className="field" />
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
            </fieldset>
          )}
  
          {aceptarDatos && (
            <fieldset className="space-y-2">
              <legend className="mb-3 text-lg font-bold text-primary">{cambiarClave ? '2. ' : ''}Tratamiento de datos personales</legend>
              <p className="rounded-md border border-line bg-surface-alt p-3 text-sm text-muted">
                Para legalizar facturas y viáticos esta aplicación trata tus datos personales (nombre, documento,
                correo) y los datos de los soportes que cargues, conforme a la Ley 1581 de 2012. Tu compañía es la
                responsable del tratamiento y los usa solo para la gestión de legalizaciones. Puedes ejercer tus
                derechos de conocer, actualizar o rectificar tus datos ante tu compañía.
              </p>
              <label className="flex items-start gap-2 text-base text-ink">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                Autorizo el tratamiento de mis datos personales.
              </label>
            </fieldset>
          )}
  
          {error && <p role="alert" className="alert-error">{error}</p>}
  
          <button disabled={!habilitado || busy} className="btn-primary w-full">
            {busy ? 'Guardando…' : 'Continuar'}
          </button>
          <button type="button" onClick={logout} className="btn-link block w-full text-center text-sm">
            Cerrar sesión
          </button>
        </form>
      </main>
    </div>
  );
}