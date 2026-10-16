import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <form onSubmit={enviar} className="w-full max-w-md space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-indigo-700">Bienvenido, {user.nombre}</h1>
        <p className="text-sm text-slate-500">Antes de continuar necesitamos completar estos pasos.</p>

        {cambiarClave && (
          <fieldset className="space-y-3">
            <legend className="font-medium">1. Cambia tu contraseña temporal</legend>
            <input type="password" required autoComplete="current-password" placeholder="Contraseña actual"
              value={actual} onChange={(e) => setActual(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <input type="password" required autoComplete="new-password" placeholder="Nueva contraseña"
              value={nueva} onChange={(e) => setNueva(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <input type="password" required autoComplete="new-password" placeholder="Repite la nueva contraseña"
              value={repetir} onChange={(e) => setRepetir(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <ul className="text-sm">
              {REGLAS.map(([txt, f]) => (
                <li key={txt} className={f(nueva) ? 'text-green-700' : 'text-slate-400'}>
                  {f(nueva) ? '✓' : '○'} {txt}
                </li>
              ))}
              <li className={nueva && nueva === repetir ? 'text-green-700' : 'text-slate-400'}>
                {nueva && nueva === repetir ? '✓' : '○'} Las contraseñas coinciden
              </li>
            </ul>
          </fieldset>
        )}

        {aceptarDatos && (
          <fieldset className="space-y-2">
            <legend className="font-medium">{cambiarClave ? '2. ' : ''}Tratamiento de datos personales</legend>
            <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">
              Para legalizar facturas y viáticos esta aplicación trata tus datos personales (nombre, documento,
              correo) y los datos de los soportes que cargues, conforme a la Ley 1581 de 2012. Tu compañía es la
              responsable del tratamiento y los usa solo para la gestión de legalizaciones. Puedes ejercer tus
              derechos de conocer, actualizar o rectificar tus datos ante tu compañía.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1" />
              Autorizo el tratamiento de mis datos personales.
            </label>
          </fieldset>
        )}

        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button disabled={!habilitado || busy}
          className="w-full rounded-md bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? 'Guardando…' : 'Continuar'}
        </button>
        <button type="button" onClick={logout} className="w-full text-sm text-slate-500 underline">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}