const KEY = 'legalizacion_token';

export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t) => sessionStorage.setItem(KEY, t);
export const clearToken = () => sessionStorage.removeItem(KEY);

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export class ApiError extends Error {
  constructor(status, message, code, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form; // FormData: el navegador pone el Content-Type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor', 'RED');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // 401 = sesión inválida. Excepto en el login, donde significa clave incorrecta.
    if (res.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new ApiError(res.status, data?.error || 'Error inesperado', data?.code, data);
  }
  return data;
}
// Descarga un archivo protegido (plantillas de Excel) usando el token de la sesión
export async function descargar(path, nombre) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new ApiError(res.status, d?.error || 'No se pudo descargar el archivo', d?.code);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}