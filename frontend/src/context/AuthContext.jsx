import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  // Al abrir la app, si hay token, recupera el perfil
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  // Vuelve a pedir el perfil (tras cambiar clave, aceptar datos o entrar/salir de una compañía)
  const refresh = async () => {
    const r = await api('/auth/me');
    setUser(r.user);
    return r.user;
  };

  // Cambia de sesión (entrar a una compañía como superadmin, o salir)
  const switchToken = async (token) => {
    setToken(token);
    return refresh();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, switchToken }}>
      {children}
    </AuthContext.Provider>
  );
}