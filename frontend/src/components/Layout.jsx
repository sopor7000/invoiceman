import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import Banner from './Banner';

const link = ({ isActive }) =>
  `relative px-4 py-3 text-sm font-semibold text-white transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:transition-transform ${
    isActive
      ? 'bg-white/15 after:scale-x-100 after:bg-flag-light'
      : 'hover:bg-white/10 after:scale-x-0 after:bg-white hover:after:scale-x-100'
  }`;

export default function Layout() {
  const { user, logout, switchToken } = useAuth();
  const nav = useNavigate();

  const salirDeCompania = async () => {
    const r = await api('/super/exit', { method: 'POST' });
    await switchToken(r.token);
    nav('/super');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-primary focus:shadow-lift"
      >
        Saltar al contenido principal
      </a>

      <Banner />

      <div className="sticky top-0 z-40">
        <header className="border-b border-line/60 bg-white shadow-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                className="grid h-11 w-11 place-items-center rounded-lg bg-linear-to-br from-primary-light to-primary-darker text-lg font-extrabold text-white shadow-btn ring-2 ring-flag/80"
                aria-hidden="true"
              >
                {(user.tenant?.nombre || 'I').charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  InvoiceMan
                </p>
                <p className="text-lg font-extrabold leading-tight text-primary">
                  {user.tenant ? user.tenant.nombre : 'InvoiceMan'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">
                Sesión: <strong className="text-ink">{user.nombre}</strong>
              </span>
              {user.impersonating && (
                <button onClick={salirDeCompania} className="btn-red btn-sm">
                  Salir de la compañía
                </button>
              )}
              <button onClick={logout} className="btn-primary btn-sm">Cerrar sesión</button>
            </div>
          </div>
        </header>

        {!(user.isSuperAdmin && !user.tenant) && (
          <nav className="bg-linear-to-r from-primary-darker via-primary-dark to-primary shadow-nav" aria-label="Navegación principal">
            <div className="mx-auto flex max-w-6xl flex-wrap px-4">
              <NavLink to="/" end className={link}>Inicio</NavLink>
              <NavLink to="/mis-solicitudes" className={link}>Mis solicitudes</NavLink>
              {user.isApprover && <NavLink to="/viaticos/aprobacion" className={link}>Aprobar viáticos</NavLink>}
              {user.isAdmin && <NavLink to="/inbox" className={link}>Bandeja</NavLink>}
              {user.isAdmin && <NavLink to="/estadisticas" className={link}>Estadísticas</NavLink>}
              {user.isAdmin && <NavLink to="/configuracion" className={link}>Configuración</NavLink>}
            </div>
          </nav>
        )}
      </div>

      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-linear-to-r from-charcoal to-[#1f2933] text-sm text-white">
        <div className="h-1 bg-flag" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <p className="font-bold">{user.tenant ? user.tenant.nombre : 'InvoiceMan'}</p>
          <p className="text-line">Tratamiento de datos personales conforme a la Ley 1581 de 2012.</p>
        </div>
      </footer>
    </div>
  );
}