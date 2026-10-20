import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cop } from '../utils';

// Ventana flotante de confirmación. etapa: 'confirmar' | 'listo'
export default function DisclaimerModal({ etapa, texto, total, busy, error, onAceptar, onCancelar, onDescargar, onCerrar }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const esc = (e) => e.key === 'Escape' && !busy && (etapa === 'listo' ? onCerrar() : onCancelar());
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, etapa, onCancelar, onCerrar]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-charcoal/70 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="dm-t">
      <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col shadow-lift">
        {etapa === 'confirmar' ? (
          <>
            <h2 id="dm-t" ref={ref} tabIndex={-1} className="section-title outline-none">Confirma tu solicitud de viáticos</h2>

            <div className="flex items-center justify-between rounded-lg bg-info-bg px-4 py-3">
              <span className="font-bold">Total solicitado</span>
              <span className="text-2xl font-extrabold text-primary">{cop(total)}</span>
            </div>

            <p className="mb-1 mt-4 text-sm font-bold uppercase tracking-wide text-muted">Condiciones</p>
            <div className="flex-1 overflow-y-auto whitespace-pre-line rounded-md border border-line bg-surface-alt p-4 text-sm leading-relaxed">
              {texto}
            </div>

            {error && <div role="alert" className="alert-error mt-4"><p>{error}</p></div>}

            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={onAceptar} disabled={busy} className="btn-primary">
                {busy ? 'Enviando…' : 'Acepto las condiciones y envío la solicitud'}
              </button>
              <button onClick={onCancelar} disabled={busy} className="btn-secondary">Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="dm-t" ref={ref} tabIndex={-1} className="section-title outline-none">Solicitud enviada</h2>
            <div className="alert-success">
              <p className="alert-title">Aceptaste las condiciones y tu solicitud quedó registrada</p>
              <p>Descarga el PDF: es la confirmación de lo solicitado y de la aceptación de las condiciones.</p>
            </div>
            {error && <div role="alert" className="alert-error mt-4"><p>{error}</p></div>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={onDescargar} className="btn-red">Descargar PDF de confirmación</button>
              <Link to="/mis-solicitudes" className="btn-secondary">Ver mis solicitudes</Link>
              <button onClick={onCerrar} className="btn-link">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}