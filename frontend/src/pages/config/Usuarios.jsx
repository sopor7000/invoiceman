import { useCallback, useEffect, useState } from 'react';
import { api, descargar } from '../../api/client';
import Spinner from '../../components/Spinner';
import { descargarCsv } from '../../utils';

const TIPOS_DOC = ['CC', 'CE', 'PA', 'PEP', 'PPT', 'TI', 'NIT'];
const VACIO = { tipoDoc: 'CC', numeroDoc: '', nombre: '', email: '' };

export default function Usuarios() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [f, setF] = useState(VACIO);
  const [clave, setClave] = useState(null); // { email, passwordTemporal }
  const [archivo, setArchivo] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [buscar, setBuscar] = useState('');

  const cargar = useCallback(() => {
    api('/users').then((r) => setLista(r.users)).catch((e) => { setError(e.message); setLista([]); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const limpiar = () => { setError(''); setMsg(''); };

  const crear = async (e) => {
    e.preventDefault();
    limpiar();
    setBusy(true);
    try {
      const r = await api('/users', { method: 'POST', body: f });
      setClave({ email: r.user.email, passwordTemporal: r.passwordTemporal });
      setF(VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cambiar = async (id, cambios) => {
    limpiar();
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: cambios });
      setMsg('Cambios guardados.');
    } catch (err) {
      setError(err.message);
    }
    cargar();
  };

  const reset = async (u) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.nombre}? Deberá cambiarla al ingresar.`)) return;
    limpiar();
    try {
      const r = await api(`/users/${u.id}/reset-password`, { method: 'POST' });
      setClave({ email: r.email, passwordTemporal: r.passwordTemporal });
    } catch (err) {
      setError(err.message);
    }
  };

  const plantilla = () => descargar('/users/template', 'plantilla_usuarios.xlsx').catch((e) => setError(e.message));

  const elegirArchivo = (e) => {
    const a = e.target.files?.[0];
    limpiar();
    if (!a) return;
    if (!/\.xlsx$/i.test(a.name)) {
      e.target.value = '';
      return setError('Solo se admite Excel (.xlsx). Guarda el archivo como "Libro de Excel".');
    }
    setArchivo(a);
  };

  const cargarMasivo = async () => {
    limpiar();
    setBulk(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      setBulk(await api('/users/bulk', { method: 'POST', form }));
      setArchivo(null);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const bajarClaves = () =>
    descargarCsv('claves_temporales.csv', [
      ['Nombre', 'Correo', 'Contraseña temporal'],
      ...bulk.creados.map((c) => [c.nombre, c.email, c.passwordTemporal]),
    ]);

  const visibles = (lista || []).filter((u) =>
    `${u.nombre} ${u.email} ${u.numeroDoc}`.toLowerCase().includes(buscar.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      {clave && (
        <div className="alert-warning">
          <p className="alert-title">Contraseña temporal (se muestra una sola vez)</p>
          <p>{clave.email}: <code className="rounded bg-white px-2 py-0.5 font-mono font-bold">{clave.passwordTemporal}</code></p>
          <div className="mt-2 flex gap-4">
            <button className="btn-link text-sm" onClick={() => navigator.clipboard?.writeText(clave.passwordTemporal)}>Copiar</button>
            <button className="btn-link text-sm" onClick={() => setClave(null)}>Ocultar</button>
          </div>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={crear} className="card space-y-4">
          <h3 className="section-title">Crear usuario</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="td" className="label">Tipo doc.</label>
              <select id="td" className="field" value={f.tipoDoc} onChange={(e) => setF({ ...f, tipoDoc: e.target.value })}>
                {TIPOS_DOC.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nd" className="label">Número de documento</label>
              <input id="nd" required pattern="[A-Za-z0-9]{4,20}" title="De 4 a 20 letras o números, sin puntos" className="field"
                value={f.numeroDoc} onChange={(e) => setF({ ...f, numeroDoc: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="un" className="label">Nombre completo</label>
            <input id="un" required minLength={2} className="field" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ue" className="label">Correo electrónico</label>
            <input id="ue" type="email" required className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <span className="hint">Todos los usuarios nuevos tienen rol estándar. Los roles se asignan en la tabla.</span>
          </div>
          <button disabled={busy} className="btn-primary">{busy ? 'Creando…' : 'Crear usuario'}</button>
        </form>

        <div className="card space-y-4">
          <h3 className="section-title">Carga masiva (Excel)</h3>
          <p className="text-muted">Descarga la plantilla, complétala y súbela en formato <strong>.xlsx</strong>. Máximo 500 filas.</p>
          <button type="button" onClick={plantilla} className="btn-secondary btn-sm">Descargar plantilla</button>
          <div>
            <label htmlFor="bulk" className="label">Archivo de usuarios</label>
            <input id="bulk" type="file" accept=".xlsx" onChange={elegirArchivo}
              className="field file:mr-4 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-white" />
          </div>
          <button disabled={!archivo || busy} onClick={cargarMasivo} className="btn-red">
            {busy ? 'Cargando…' : 'Cargar usuarios'}
          </button>
        </div>
      </section>

      {bulk && (
        <section className="card space-y-4">
          <h3 className="section-title">Resultado de la carga</h3>
          <p>
            Leídas: <strong>{bulk.resumen.leidas}</strong> · Creados: <strong className="text-success">{bulk.resumen.creados}</strong> ·
            Rechazadas: <strong className="text-danger">{bulk.resumen.rechazadas}</strong>
          </p>
          {bulk.creados.length > 0 && (
            <div className="alert-warning">
              <p className="alert-title">Las contraseñas temporales no se volverán a mostrar</p>
              <button onClick={bajarClaves} className="btn-secondary btn-sm mt-2">Descargar claves (CSV para Excel)</button>
            </div>
          )}
          {bulk.errores.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fila</th><th>Correo</th><th>Motivo</th></tr></thead>
                <tbody>
                  {bulk.errores.map((x) => (
                    <tr key={x.fila}><td>{x.fila}</td><td>{x.email}</td><td className="text-danger">{x.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="section-title flex-1">Usuarios de la compañía</h3>
          <div>
            <label htmlFor="bus" className="label">Buscar</label>
            <input id="bus" className="field" placeholder="Nombre, correo o documento" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
        </div>
        {lista === null ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Nombre</th><th>Documento</th><th>Correo</th><th>Administrador</th><th>Aprobador</th><th>Activo</th><th /></tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id} className={u.activo ? '' : 'opacity-60'}>
                    <td className="font-semibold">{u.nombre}</td>
                    <td>{u.tipoDoc} {u.numeroDoc}</td>
                    <td>{u.email}</td>
                    <td><input type="checkbox" className="h-5 w-5 accent-primary" checked={u.isAdmin}
                      aria-label={`Administrador: ${u.nombre}`} onChange={(e) => cambiar(u.id, { isAdmin: e.target.checked })} /></td>
                    <td><input type="checkbox" className="h-5 w-5 accent-primary" checked={u.isApprover}
                      aria-label={`Aprobador: ${u.nombre}`} onChange={(e) => cambiar(u.id, { isApprover: e.target.checked })} /></td>
                    <td><input type="checkbox" className="h-5 w-5 accent-primary" checked={u.activo}
                      aria-label={`Activo: ${u.nombre}`} onChange={(e) => cambiar(u.id, { activo: e.target.checked })} /></td>
                    <td><button className="btn-link text-sm" onClick={() => reset(u)}>Restablecer clave</button></td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={7} className="text-muted">Sin resultados.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}