import { useCallback, useEffect, useState } from 'react';
import { api, descargar } from '../../api/client';
import Spinner from '../../components/Spinner';
import { fechaHora } from '../../utils';

export default function BaseDian() {
  const [archivo, setArchivo] = useState(null);
  const [res, setRes] = useState(null);
  const [hist, setHist] = useState(null);
  const [intentos, setIntentos] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api('/dian/uploads').then(setHist).catch((e) => { setError(e.message); setHist({ totalFacturas: 0, cargas: [] }); });
    api('/dian/attempts').then((r) => setIntentos(r.intentos)).catch(() => setIntentos([]));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const elegir = (e) => {
    const a = e.target.files?.[0];
    setError('');
    if (!a) return;
    if (!/\.xlsx$/i.test(a.name)) {
      e.target.value = '';
      return setError('Solo se admite Excel (.xlsx). Si tu archivo es .xls o .csv, ábrelo y guárdalo como "Libro de Excel (.xlsx)".');
    }
    if (a.size > 10 * 1024 * 1024) {
      e.target.value = '';
      return setError('El archivo supera los 10 MB. Divídelo en varias partes.');
    }
    setArchivo(a);
  };

  const subir = async () => {
    setError(''); setRes(null); setBusy(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      setRes(await api('/dian/upload', { method: 'POST', form }));
      setArchivo(null);
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-muted">
        Carga en Excel (.xlsx) la información extraída de la DIAN. Al legalizar una factura electrónica, el sistema busca
        su CUFE en esta base: si lo encuentra, la aprueba automáticamente. La carga es incremental: los CUFE ya
        cargados se omiten. Máximo 20.000 filas y 10 MB por archivo.
      </p>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

      <section className="card space-y-4">
        <h3 className="section-title">Cargar archivo</h3>
        <p className="text-sm text-muted">
          Columnas: <strong>cufe</strong>, <strong>nit_emisor</strong>, <strong>nombre_emisor</strong>, <strong>valor_total</strong> (obligatorias),
          nit_receptor y fecha_emision (recomendadas).
        </p>
        <button type="button" className="btn-secondary btn-sm"
          onClick={() => descargar('/dian/template', 'plantilla_base_dian.xlsx').catch((e) => setError(e.message))}>
          Descargar plantilla
        </button>
        <div>
          <label htmlFor="dian" className="label">Archivo Excel (.xlsx)</label>
          <input id="dian" type="file" accept=".xlsx" onChange={elegir}
            className="field file:mr-4 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-white" />
        </div>
        <button disabled={!archivo || busy} onClick={subir} className="btn-red">{busy ? 'Procesando…' : 'Cargar base DIAN'}</button>
      </section>

      {res && (
        <section className="card space-y-3">
          <h3 className="section-title">Resultado</h3>
          <dl className="grid gap-3 sm:grid-cols-5">
            {[['Leídas', res.resumen.leidas], ['Válidas', res.resumen.validas], ['Nuevas', res.resumen.nuevos],
              ['Ya existían', res.resumen.yaExistian], ['Rechazadas', res.resumen.rechazadas]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-info-bg p-3 text-center">
                <dt className="text-xs font-bold uppercase text-muted">{k}</dt>
                <dd className="text-2xl font-extrabold text-primary">{v}</dd>
              </div>
            ))}
          </dl>
          {res.errores.length > 0 && (
            <div className="table-wrap max-h-72 overflow-y-auto">
              <table className="table">
                <thead><tr><th>Fila</th><th>Motivo</th></tr></thead>
                <tbody>{res.errores.map((x) => <tr key={x.fila}><td>{x.fila}</td><td className="text-danger">{x.motivo}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {res.erroresOmitidos > 0 && <p className="text-sm text-muted">Y {res.erroresOmitidos} filas rechazadas más.</p>}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="section-title">Historial de cargas</h3>
        {hist === null ? <Spinner /> : (
          <>
            <p>Facturas en la base: <strong>{hist.totalFacturas}</strong></p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Archivo</th><th>Leídas</th><th>Nuevas</th><th>Subido por</th></tr></thead>
                <tbody>
                  {hist.cargas.map((c) => (
                    <tr key={c.id}><td className="whitespace-nowrap">{fechaHora(c.fecha)}</td><td>{c.archivo}</td>
                      <td>{c.leidas}</td><td>{c.nuevos}</td><td>{c.subidoPor}</td></tr>
                  ))}
                  {hist.cargas.length === 0 && <tr><td colSpan={5} className="text-muted">Aún no hay cargas.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="section-title">CUFE no encontrados por los usuarios</h3>
        <p className="text-sm text-muted">Si aparecen facturas aquí, carga una base DIAN más reciente: el usuario podrá reintentar.</p>
        {intentos === null ? <Spinner /> : (
          <div className="table-wrap max-h-80 overflow-y-auto">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Motivo</th><th>CUFE</th></tr></thead>
              <tbody>
                {intentos.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{fechaHora(a.fecha)}</td>
                    <td>{a.usuario}<span className="block text-xs text-muted">{a.documento}</span></td>
                    <td>{a.motivo === 'NIT_NO_COINCIDE' ? 'A nombre de otra compañía' : 'No está en la base'}</td>
                    <td className="max-w-xs break-all font-mono text-xs">{a.cufe}</td>
                  </tr>
                ))}
                {intentos.length === 0 && <tr><td colSpan={4} className="text-muted">Sin intentos fallidos.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}