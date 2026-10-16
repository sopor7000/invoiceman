import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import Spinner from '../../components/Spinner';

const ETIQUETA = { VIDEO: 'Video', PRESENTACION: 'Presentación', LINK: 'Enlace' };
const VACIO = { tipo: 'VIDEO', titulo: '', descripcion: '', url: '' };

export default function AyudaConfig() {
  const [lista, setLista] = useState(null);
  const [f, setF] = useState(VACIO);
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api('/help?todos=1').then((r) => setLista(r.contenido)).catch((e) => { setError(e.message); setLista([]); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const accept = f.tipo === 'VIDEO' ? '.mp4,.webm' : '.pdf,.ppt,.pptx';

  const crear = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      const form = new FormData();
      form.append('tipo', f.tipo);
      form.append('titulo', f.titulo.trim());
      if (f.descripcion.trim()) form.append('descripcion', f.descripcion.trim());
      if (f.tipo !== 'LINK' && archivo) form.append('archivo', archivo);
      else if (f.url.trim()) form.append('url', f.url.trim());
      await api('/help', { method: 'POST', form });
      setF(VACIO); setArchivo(null);
      e.target.reset();
      setMsg('Contenido publicado.');
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const alternar = async (c) => {
    setError(''); setMsg('');
    try {
      await api(`/help/${c.id}`, { method: 'PATCH', body: { activo: !c.activo } });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-muted">
        Este contenido se muestra al usuario cuando el CUFE de su factura no se encuentra en la base de la DIAN.
        Sube un video (MP4/WEBM) o una presentación (PDF/PowerPoint) de hasta 50 MB, o pega un enlace (YouTube, Drive, etc.).
      </p>
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      <form onSubmit={crear} className="card space-y-4">
        <h3 className="section-title">Agregar contenido</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="at" className="label">Tipo</label>
            <select id="at" className="field" value={f.tipo}
              onChange={(e) => { setF({ ...f, tipo: e.target.value }); setArchivo(null); }}>
              {Object.entries(ETIQUETA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ati" className="label">Título</label>
            <input id="ati" required minLength={3} maxLength={120} className="field" value={f.titulo}
              onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="ad" className="label">Descripción (opcional)</label>
          <input id="ad" maxLength={500} className="field" value={f.descripcion}
            onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </div>
        {f.tipo !== 'LINK' && (
          <div>
            <label htmlFor="af" className="label">Archivo ({accept.replaceAll('.', '').replaceAll(',', ', ')})</label>
            <input id="af" type="file" accept={accept} onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              className="field file:mr-4 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-white" />
            <span className="hint">O deja el archivo vacío y usa un enlace.</span>
          </div>
        )}
        {(f.tipo === 'LINK' || !archivo) && (
          <div>
            <label htmlFor="au" className="label">Enlace</label>
            <input id="au" type="url" className="field" placeholder="https://" required={f.tipo === 'LINK'}
              value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </div>
        )}
        <button disabled={busy} className="btn-primary">{busy ? 'Publicando…' : 'Publicar'}</button>
      </form>

      <section className="space-y-3">
        <h3 className="section-title">Contenido publicado</h3>
        {lista === null ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Título</th><th>Origen</th><th>Activo</th></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={c.activo ? '' : 'opacity-60'}>
                    <td><span className="tag-neutral">{ETIQUETA[c.tipo]}</span></td>
                    <td className="font-semibold">{c.titulo}</td>
                    <td>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn-link text-sm">{c.esArchivo ? 'Ver archivo' : 'Abrir enlace'}</a> : '—'}</td>
                    <td><input type="checkbox" className="h-5 w-5 accent-primary" checked={c.activo}
                      aria-label={`Activo: ${c.titulo}`} onChange={() => alternar(c)} /></td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={4} className="text-muted">Aún no hay contenido.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}