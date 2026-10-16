import { useEffect, useRef, useState } from 'react';

// Diálogo para pedir el motivo del rechazo (mínimo 5 caracteres, como exige el servidor)
export default function RechazoModal({ titulo, onConfirm, onCancel }) {
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const esc = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);

  const enviar = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onConfirm(motivo.trim());
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-charcoal/60 p-4 backdrop-blur-sm" role="dialog"
      aria-modal="true" aria-labelledby="rm-t">
      <form onSubmit={enviar} className="card w-full max-w-md space-y-4 shadow-lift">
        <h2 id="rm-t" className="section-title">{titulo}</h2>
        <div>
          <label htmlFor="motivo" className="label">Motivo del rechazo</label>
          <textarea id="motivo" ref={ref} required minLength={5} maxLength={500} rows={3} className="field"
            value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <span className="hint">El usuario verá este motivo en su notificación.</span>
        </div>
        <div className="flex gap-3">
          <button disabled={busy || motivo.trim().length < 5} className="btn-danger">
            {busy ? 'Rechazando…' : 'Rechazar'}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  );
}