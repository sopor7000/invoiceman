import jsQR from 'jsqr';

const CUFE_RE = /[0-9a-fA-F]{96}/;

// Extrae el CUFE desde el texto de un QR: URL con documentkey=..., "CUFE: ..." o el hash suelto
export function extraerCufe(texto) {
  if (!texto) return null;
  const t = String(texto);

  try {
    const u = new URL(t);
    for (const [k, v] of u.searchParams) {
      if (/^(documentkey|cufe|cude)$/i.test(k) && CUFE_RE.test(v)) return v.match(CUFE_RE)[0].toLowerCase();
    }
  } catch {
    /* no es una URL, se sigue con el texto */
  }

  const m = t.match(CUFE_RE);
  return m ? m[0].toLowerCase() : null;
}

// Intenta decodificar un QR en un canvas, probando varias escalas
function decodificarCanvas(canvas) {
  const escalas = [1, 0.75, 0.5, 1.5];
  for (const e of escalas) {
    const w = Math.round(canvas.width * e);
    const h = Math.round(canvas.height * e);
    if (w < 80 || h < 80 || w > 4000 || h > 4000) continue;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const r = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (r?.data) return r.data;
  }
  return null;
}

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo abrir la imagen'));
    };
    img.src = url;
  });
}

async function leerImagen(file) {
  const img = await cargarImagen(file);
  // Limita el tamaño máximo para no agotar memoria con fotos muy grandes
  const lado = Math.max(img.width, img.height);
  const factor = lado > 2400 ? 2400 / lado : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * factor);
  canvas.height = Math.round(img.height * factor);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return decodificarCanvas(canvas);
}

async function leerPdf(file) {
  // Carga perezosa: pdf.js es pesado y solo se usa aquí
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const paginas = Math.min(pdf.numPages, 5);

  for (let n = 1; n <= paginas; n++) {
    const page = await pdf.getPage(n);

    // El CUFE también suele venir impreso como texto en la factura
    const texto = await page.getTextContent();
    const plano = texto.items.map((i) => i.str).join('');
    const delTexto = extraerCufe(plano.replace(/\s+/g, ''));
    if (delTexto) return delTexto;

    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const r = decodificarCanvas(canvas);
    if (r) return r;
  }
  return null;
}

// Lee un archivo (imagen o PDF) y devuelve el CUFE, o null si no lo encuentra
export async function cufeDeArchivo(file) {
  const crudo = file.type === 'application/pdf' ? await leerPdf(file) : await leerImagen(file);
  return extraerCufe(crudo);
}