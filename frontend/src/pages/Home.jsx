import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Notifications from '../components/Notifications';

const OPCIONES = [
  { to: '/legalizar/electronica', titulo: 'Factura electrónica', texto: 'Escanea el código QR (CUFE) con tu cámara o carga la imagen o el PDF.', icono: '⌗' },
  { to: '/legalizar/manual', titulo: 'Factura manual', texto: 'Carga el soporte e indica concepto, comercio y valor.', icono: '✎' },
  { to: '/legalizar/extranjera', titulo: 'Factura del extranjero', texto: 'Para gastos en otra moneda, con país y TRM.', icono: '◍' },
];

// Los enlaces siempre abren en pestaña nueva
DOMPurify.addHook('afterSanitizeAttributes', (n) => {
  if (n.tagName === 'A') {
    n.setAttribute('target', '_blank');
    n.setAttribute('rel', 'noopener noreferrer');
  }
});

export default function Home() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api('/settings').then((r) => setInfo(r.info)).catch(() => {});
  }, []);

  const html = info?.contenidoHtml
    ? DOMPurify.sanitize(info.contenidoHtml, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'img'] })
    : '';

  return (
    <div className="space-y-8">
      <section className="relative animate-fade-up overflow-hidden rounded-xl bg-linear-to-br from-primary-darker via-primary-dark to-primary-light p-8 text-white shadow-lift">
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg,#fff 0 2px,transparent 2px 28px)' }} aria-hidden="true" />
        <div className="absolute -right-10 -top-10 h-48 w-48 animate-float rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-wide text-accent">Inicio</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Bienvenido, {user.nombre}</h1>
          <p className="mt-2 max-w-xl text-lg text-accent">¿Qué deseas hacer hoy?</p>
        </div>
      </section>

      <section aria-labelledby="t-leg">
        <h2 id="t-leg" className="section-title">Legalizar una factura</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {OPCIONES.map((o, i) => (
            <Link key={o.to} to={o.to} style={{ animationDelay: `${i * 90}ms` }}
              className="card card-hover group flex flex-col">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-lg bg-linear-to-br from-primary-light to-primary-darker text-2xl text-white shadow-btn ring-2 ring-flag/70">
                {o.icono}
              </span>
              <h3 className="text-xl font-bold text-primary">{o.titulo}</h3>
              <p className="mt-1 flex-1 text-muted">{o.texto}</p>
              <span className="mt-4 font-bold text-flag group-hover:underline">Comenzar →</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="t-via">
        <h2 id="t-via" className="section-title">Viáticos</h2>
        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-primary">Solicitar viáticos</h3>
            <p className="text-muted">Indica un valor por cada concepto disponible y envía tu solicitud.</p>
          </div>
          <Link to="/viaticos" className="btn-red">Solicitar viáticos</Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {html && (
          <section className="card lg:col-span-2">
            <h2 className="section-title">{info.titulo}</h2>
            <div className="contenido-rico" dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        )}
        <div className={html ? '' : 'lg:col-span-3'}>
          <Notifications />
        </div>
      </div>
    </div>
  );
}