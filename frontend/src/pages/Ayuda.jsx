import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import Spinner from '../components/Spinner';

const ETIQUETA = { VIDEO: 'Video', PRESENTACION: 'Presentación', LINK: 'Enlace' };

function Contenido({ c }) {
  const esPdf = c.esArchivo && /\.pdf(\?|$)/i.test(c.url || '');
  const esVideo = c.tipo === 'VIDEO' && c.esArchivo;
  return (
    <article className="card space-y-3">
      <div className="flex items-center gap-2">
        <span className="tag-neutral">{ETIQUETA[c.tipo]}</span>
        <h3 className="text-lg font-bold text-primary">{c.titulo}</h3>
      </div>
      {c.descripcion && <p className="text-muted">{c.descripcion}</p>}

      {esVideo && <video src={c.url} controls className="w-full rounded-lg shadow-card" />}
      {esPdf && <iframe title={c.titulo} src={c.url} className="h-[28rem] w-full rounded-lg border border-line" />}

      {c.url && (
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
          {c.esArchivo ? 'Abrir o descargar' : 'Abrir enlace'}
        </a>
      )}
    </article>
  );
}

export default function Ayuda() {
  const { state } = useLocation();
  const [lista, setLista] = useState(null);

  useEffect(() => {
    api('/help').then((r) => setLista(r.contenido)).catch(() => setLista([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">No encontramos tu factura</h1>
        <p className="page-lead">
          El CUFE no está en la base de la DIAN cargada por tu compañía. Sigue las instrucciones para resolverlo.
        </p>
      </div>

      {state?.cufe && (
        <div className="alert-warning">
          <p className="alert-title">CUFE consultado</p>
          <p className="break-all font-mono text-sm">{state.cufe}</p>
        </div>
      )}

      {lista === null ? (
        <Spinner />
      ) : lista.length === 0 ? (
        <div className="alert-info">
          <p>
            Tu administrador aún no ha publicado instrucciones. Comunícate con él para que cargue la base de la DIAN
            actualizada, o legaliza la factura como manual.
          </p>
        </div>
      ) : (
        lista.map((c) => <Contenido key={c.id} c={c} />)
      )}

      <div className="flex flex-wrap gap-3">
        <Link to="/legalizar/electronica" className="btn-primary">Volver a intentar</Link>
        <Link to="/legalizar/manual" className="btn-secondary">Legalizar como factura manual</Link>
      </div>
    </div>
  );
}