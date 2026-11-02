import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Banner from '../components/Banner';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setMensaje('');
    setBusy(true);
    try {
      const r = await api('/auth/forgot', { method: 'POST', body: { email: email.trim() } });
      setMensaje(r.mensaje);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Banner />

      <main className="flex flex-1 items-center justify-center bg-linear-to-b from-surface-alt to-surface px-4 py-12">
        <form onSubmit={enviar} className="card w-full max-w-md space-y-5 shadow-lift">
          <div>
            <h1 className="page-title">Recuperar contraseña</h1>
            <p className="text-muted">Escribe tu correo corporativo y te enviaremos un enlace para crear una nueva.</p>
          </div>

          {mensaje && (
            <div role="status" className="alert-success">
              <p>{mensaje}</p>
            </div>
          )}

          {error && (
            <div role="alert" className="alert-error">
              <p className="alert-title">No pudimos procesar la solicitud</p>
              <p>{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="email" className="label">Correo electrónico</label>
            <input id="email" type="email" required autoComplete="username" className="field"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </button>

          <Link to="/login" className="btn-link block text-center text-sm">
            Volver a iniciar sesión
          </Link>
        </form>
      </main>
    </div>
  );
}
