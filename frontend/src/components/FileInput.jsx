import { useEffect, useRef, useState } from 'react';

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX = 10 * 1024 * 1024;

export default function FileInput({ file, onChange, label = 'Soporte de la factura (PDF o imagen)' }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  const elegir = (e) => {
    const f = e.target.files?.[0];
    setError('');
    if (!f) return;
    if (!TIPOS.includes(f.type)) return setError('Formato no permitido. Usa PDF, JPG, PNG o WEBP.');
    if (f.size > MAX) return setError('El archivo supera los 10 MB.');
    onChange(f);
  };

  return (
    <div>
      <label htmlFor="archivo" className="label">{label}</label>
      <input ref={ref} id="archivo" type="file" accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={elegir} className="field file:mr-4 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-white" />
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
      {file && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-line bg-surface-alt p-3">
          {preview ? (
            <img src={preview} alt="Vista previa" className="h-16 w-16 rounded object-cover shadow-md" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded bg-flag text-sm font-bold text-white">PDF</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{file.name}</p>
            <p className="text-sm text-muted">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button type="button" className="btn-link text-sm"
            onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }}>
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}