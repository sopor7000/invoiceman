import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const BENEFICIOS = [
  'Legaliza facturas electrónicas con tu cámara o un archivo',
  'Aprobación automática contra la base de la DIAN',
  'Solicita viáticos y sigue su estado en tiempo real',
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Banner />

      <div className="grid flex-1 lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-linear-to-br from-primary-darker via-primary-dark to-primary-light lg:block">
          {/* Franjas diagonales sutiles */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg,#fff 0 2px,transparent 2px 28px)' }}
            aria-hidden="true"
          />
          <div className="absolute -right-24 -top-24 h-96 w-96 animate-float rounded-full bg-white/5" aria-hidden="true" />
          <div className="absolute -bottom-32 -left-20 h-[28rem] w-[28rem] animate-float rounded-full bg-white/5 [animation-delay:2s]" aria-hidden="true" />
          <div className="absolute right-16 top-1/2 h-24 w-24 animate-float rounded-full bg-flag/40 [animation-delay:4s]" aria-hidden="true" />

          <div className="relative flex h-full flex-col justify-center px-14 py-16 text-white">
            <span className="mb-6 grid h-14 w-14 animate-pop place-items-center rounded-xl bg-white text-2xl font-extrabold text-primary shadow-lift ring-4 ring-flag">
              I
            </span>
            <h2 className="animate-fade-up text-4xl font-extrabold leading-tight tracking-tight">
              InvoiceMan
            </h2>
            <p className="mt-3 max-w-md animate-fade-up text-lg text-accent [animation-delay:100ms]">
              Una plataforma segura para gestionar los soportes de gasto de tu compañía.
            </p>
            <ul className="mt-10 space-y-4">
              {BENEFICIOS.map((b, i) => (
                <li key={b} className="flex animate-fade-up items-start gap-3" style={{ animationDelay: `${200 + i * 120}ms` }}>
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-flag text-sm font-bold text-white shadow-btn-red">
                    ✓
                  </span>
                  <span className="text-base">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="flex items-center justify-center bg-linear-to-b from-surface-alt to-surface px-4 py-12">
          <form onSubmit={enviar} className="card w-full max-w-md space-y-5 shadow-lift">
            <div>
              <h1 className="page-title">Iniciar sesión</h1>
              <p className="text-muted">Ingresa con tu correo corporativo y tu contraseña.</p>
            </div>

            {error && (
              <div role="alert" className="alert-error">
                <p className="alert-title">No pudimos iniciar tu sesión</p>
                <p>{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">Correo electrónico</label>
              <input id="email" type="email" required autoComplete="username" className="field"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
              <label htmlFor="password" className="label">Contraseña</label>
              <input id="password" type={mostrar ? 'text' : 'password'} required autoComplete="current-password"
                className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setMostrar((m) => !m)} className="btn-link mt-2 text-sm">
                {mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              </button>
            </div>

            <button disabled={busy} className="btn-primary w-full">
              {busy ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}