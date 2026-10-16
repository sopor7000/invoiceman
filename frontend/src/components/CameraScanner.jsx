import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const ID = 'lector-qr';

// Abre la cámara trasera y llama onScan(texto) al detectar un QR
export default function CameraScanner({ onScan, onClose }) {
  const scanner = useRef(null);
  const listo = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    const qr = new Html5Qrcode(ID);
    scanner.current = qr;

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.8, height: Math.min(w, h) * 0.8 }) },
      (texto) => {
        if (listo.current) return;
        listo.current = true;
        onScan(texto);
      },
      () => {}
    )
      .then(() => {
        if (cancelado) qr.stop().then(() => qr.clear()).catch(() => {});
      })
      .catch((e) => {
        const msg = String(e?.message || e);
        if (/permission|denied|NotAllowed/i.test(msg)) {
          setError('Permiso de cámara denegado. Habilítalo en el navegador o carga una imagen o PDF.');
        } else if (/secure|https/i.test(msg)) {
          setError('La cámara requiere una conexión segura (HTTPS).');
        } else {
          setError('No se pudo abrir la cámara. Carga una imagen o PDF, o escribe el CUFE.');
        }
      });

    return () => {
      cancelado = true;
      qr.isScanning && qr.stop().then(() => qr.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div id={ID} className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-line bg-charcoal shadow-card" />
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      <p className="text-center text-sm text-muted">Apunta la cámara al código QR de la factura.</p>
      <div className="text-center">
        <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cerrar cámara</button>
      </div>
    </div>
  );
}