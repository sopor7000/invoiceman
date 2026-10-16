import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { fechaHora } from '../utils';

const TIPOS_DOC = ['CC', 'CE', 'PA', 'PEP', 'PPT', 'TI', 'NIT'];
const VACIO = { nombre: '', nit: '', tipoDoc: 'CC', numeroDoc: '', adminNombre: '', adminEmail: '' };

export default function Superadmin() {
  const { switchToken } = useAuth();
  const nav = useNavigate();
  const [lista, setLista] = useState(null);
  const [f, setF] = useState(VACIO);
  const [clave, setClave] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api('/super/tenants').then((r) => setLista(r.tenants)).catch((e) => { setError(e.message); setLista([]); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const crear = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await api('/super/tenants', {
        method: 'POST',
        body: {
          nombre: f.nombre.trim(),
          nit: f.nit.trim(),
          admin: { tipoDoc: f.tipoDoc, numeroDoc: f.numeroDoc.trim(), nombre: f.adminNombre.trim(), email: f.adminEmail.trim() },
        },
      });
      setClave({ compania: f.nombre.trim(), email: r.admin.email, passwordTemporal: r.admin.passwordTemporal });
      setF(VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cambiar = async (t, cambios) => {
    setError(''); setMsg('');
    try {
      await api(`/super/tenants/${t.id}`, { method: 'PATCH', body: cambios });
      setMsg('Cambios guardados.');
    } catch (err) {
      setError(err.message);
    }
    cargar();
  };

  const entrar = async (t) => {
    setError('');
    try {
      const r = await api(`/super/tenants/${t.id}/enter`, { method: 'POST' });
      await switchToken(r.token);
      nav('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Compañías</h1>
        <p className="page-lead">Crea compañías y entra a cada una con todos los permisos. Cada ingreso queda auditado.</p>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      {clave && (
        <div className="alert-warning">
          <p className="alert-title">Compañía creada: {clave.compania}</p>
          <p>
            Administrador {clave.email}, contraseña temporal (se muestra una sola vez):{' '}
            <code className="rounded bg-white px-2 py-0.5 font-mono font-bold">{clave.passwordTemporal}</code>
          </p>
          <div className="mt-2 flex gap-4">
            <button className="btn-link text-sm" onClick={() => navigator.clipboard?.writeText(clave.passwordTemporal)}>Copiar</button>
            <button className="btn-link text-sm" onClick={() => setClave(null)}>Ocultar</button>
          </div>
        </div>
      )}

      <form onSubmit={crear} className="card space-y-4">
        <h2 className="section-title">Nueva compañía</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cn" className="label">Nombre de la compañía</label>
            <input id="cn" required minLength={2} className="field" value={f.nombre} onChange={set('nombre')} />
          </div>
          <div>
            <label htmlFor="cnit" className="label">NIT</label>
            <input id="cnit" required className="field" placeholder="900123456-7" value={f.nit} onChange={set('nit')} />
            <span className="hint">Se guarda sin dígito de verificación.</span>
          </div>
        </div>
        <h3 className="font-bold text-primary">Primer administrador</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="ctd" className="label">Tipo doc.</label>
            <select id="ctd" className="field" value={f.tipoDoc} onChange={set('tipoDoc')}>
              {TIPOS_DOC.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cnd" className="label">Documento</label>
            <input id="cnd" required pattern="[A-Za-z0-9]{4,20}" title="De 4 a 20 letras o números" className="field"
              value={f.numeroDoc} onChange={set('numeroDoc')} />
          </div>
          <div>
            <label htmlFor="can" className="label">Nombre</label>
            <input id="can" required minLength={2} className="field" value={f.adminNombre} onChange={set('adminNombre')} />
          </div>
          <div>
            <label htmlFor="cae" className="label">Correo</label>
            <input id="cae" type="email" required className="field" value={f.adminEmail} onChange={set('adminEmail')} />
          </div>
        </div>
        <button disabled={busy} className="btn-red">{busy ? 'Creando…' : 'Crear compañía'}</button>
      </form>

      <section className="space-y-3">
        <h2 className="section-title">Compañías registradas</h2>
        {lista === null ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Compañía</th><th>NIT</th><th>Usuarios</th><th>Validar NIT receptor</th><th>Activa</th><th>Creada</th><th /></tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className={t.activo ? '' : 'opacity-60'}>
                    <td className="font-semibold">{t.nombre}</td>
                    <td>{t.nit}</td>
                    <td>{t.usuarios}</td>
                    <td>
                      <input type="checkbox" className="h-5 w-5 accent-primary" checked={t.validarNitReceptor}
                        aria-label={`Validar NIT receptor: ${t.nombre}`}
                        onChange={(e) => cambiar(t, { validarNitReceptor: e.target.checked })} />
                    </td>
                    <td>
                      <input type="checkbox" className="h-5 w-5 accent-primary" checked={t.activo}
                        aria-label={`Activa: ${t.nombre}`} onChange={(e) => cambiar(t, { activo: e.target.checked })} />
                    </td>
                    <td className="whitespace-nowrap">{fechaHora(t.creadaEn)}</td>
                    <td>
                      <button disabled={!t.activo} onClick={() => entrar(t)} className="btn-primary btn-sm">Entrar</button>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={7} className="text-muted">Aún no hay compañías.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}