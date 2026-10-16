import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

// roles: lista opcional ('admin' | 'approver' | 'super')
export default function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <Spinner className="mt-20" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  if (user.pendientes.cambiarClave || user.pendientes.aceptarDatos) {
    return <Navigate to="/bienvenida" replace />;
  }

  // El superadmin fuera de una compañía solo ve su home
  if (user.isSuperAdmin && !user.tenant) {
    return loc.pathname.startsWith('/super') ? children : <Navigate to="/super" replace />;
  }

  if (roles) {
    const ok = roles.some(
      (r) =>
        (r === 'admin' && user.isAdmin) ||
        (r === 'approver' && user.isApprover) ||
        (r === 'super' && user.isSuperAdmin)
    );
    if (!ok) return <Navigate to="/" replace />;
  }
  return children;
}