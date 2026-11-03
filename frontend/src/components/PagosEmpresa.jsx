import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Spinner from './Spinner';
import { cop, fechaCO } from '../utils';

const METODOS = { TRANSFERENCIA: 'Transferencia', WOMPI: 'Wompi', EFECTIVO: 'Efectivo', OTRO: 'Otro' };
const VACIO = {
  meses: '12', total: '', base: '', iva: '', metodo: 'TRANSFERENCIA',
  referencia: '', factura: '', facturaFecha: '', notas: '',
};

const redondear = (n) => Math.round(n * 100) / 100;

// Registro de pagos recibidos e historial de una compañía (solo superadmin)
export default function PagosEmpresa({ id, plan, onRegistrado }) {
  const [pagos, setPagos] = useState(null);
  const [ivaPct, setIvaPct] = useState(19);
  const [f, setF] = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api(`/super/tenants/${id}/pagos`)
      .then((r) => { setPagos(r.pagos); setIvaPct(r.ivaPct); })
      .catch((e) => { setError(e.message); setPagos([]); });
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Separa base e IVA a partir del total pagado (IVA incluido)
  const conTotal = (form, total) => {
    const t = Number(total);
    if (total === '' || !(t > 0)) return { ...form, total, base: '', iva: '' };
    const base = redondear(t / (1 + ivaPct / 100));
    return { ...form, total, base: String(base), iva: String(redondear(t - base)) };
  };

  const tramo = plan.tramos.find((t) => t.actual);
  const meses = Number(f.meses) || 0;
  const precioTramo = tramo?.precioMes != null && meses > 0
    ? redondear(tramo.precioMes * meses * (meses === 12 ? 1 - plan.descuentoAnualPct / 100 : 1))
    : null;

  const registrar = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await api(`/super/tenants/${id}/pagos`, {
        method: 'POST',
        body: {
          meses,
          valorBase: Number(f.base),
          valorIva: Number(f.iva || 0),
          metodo: f.metodo,
          referenciaPago: f.referencia.trim() || null,
          facturaNumero: f.factura.trim() || null,
          facturaFecha: f.facturaFecha || null,
          notas: f.notas.trim() || null,
        },
      });
      setF(VACIO);
      setMsg(`Pago registrado. Vigencia extendida hasta el ${fechaCO(r.venceEn)}.`);
      onRegistrado?.(r.venceEn);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const guardarFactura = async () => {
    setError(''); setMsg('');
    try {
      await api(`/super/pagos/${editando.id}`, {
        method: 'PATCH',
        body: { facturaNumero: editando.numero.trim() || null, facturaFecha: editando.fecha || null },
      });
      setEditando(null);
      setMsg('Factura actualizada.');
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={registrar} className="card space-y-4">
        <h2 className="section-title">Registrar un pago recibido</h2>

        {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
        {msg && <div role="status" className="alert-success"><p>{msg}</p></div>}

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="pago-meses" className="label">Meses</label>
            <input id="pago-meses" type="number" min={1} max={36} step={1} required className="field"
              value={f.meses} onChange={set('meses')} />
          </div>
          <div>
            <label htmlFor="pago-total" className="label">Total pagado (IVA incluido)</label>
            <input id="pago-total" type="number" min={1} step="0.01" inputMode="decimal" required className="field"
              value={f.total} onChange={(e) => setF(conTotal(f, e.target.value))} />
            {precioTramo !== null ? (
              <button type="button" className="btn-link mt-1 text-sm"
                onClick={() => setF(conTotal(f, String(precioTramo)))}>
                Usar precio del tramo ({cop(precioTramo)})
              </button>
            ) : (
              <span className="hint">El tramo actual no tiene precio configurado.</span>
            )}
          </div>
          <div>
            <label htmlFor="pago-base" className="label">Valor base</label>
            <input id="pago-base" type="number" min={0.01} step="0.01" inputMode="decimal" required className="field"
              value={f.base} onChange={set('base')} />
          </div>
          <div>
            <label htmlFor="pago-iva" className="label">IVA ({ivaPct} %)</label>
            <input id="pago-iva" type="number" min={0} step="0.01" inputMode="decimal" required className="field"
              value={f.iva} onChange={set('iva')} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="pago-metodo" className="label">Método</label>
            <select id="pago-metodo" className="field" value={f.metodo} onChange={set('metodo')}>
              {Object.entries(METODOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pago-ref" className="label">Referencia de pago</label>
            <input id="pago-ref" maxLength={120} className="field" value={f.referencia} onChange={set('referencia')} />
          </div>
          <div>
            <label htmlFor="pago-factura" className="label">N.º de factura</label>
            <input id="pago-factura" maxLength={60} className="field" value={f.factura} onChange={set('factura')} />
            <span className="hint">Opcional: puedes completarlo después.</span>
          </div>
          <div>
            <label htmlFor="pago-ffecha" className="label">Fecha de factura</label>
            <input id="pago-ffecha" type="date" className="field" value={f.facturaFecha} onChange={set('facturaFecha')} />
          </div>
        </div>

        <div>
          <label htmlFor="pago-notas" className="label">Notas</label>
          <textarea id="pago-notas" rows={2} maxLength={1000} className="field" value={f.notas} onChange={set('notas')} />
        </div>

        <button disabled={busy} className="btn-primary">{busy ? 'Registrando…' : 'Registrar pago'}</button>
      </form>

      <section className="space-y-3">
        <h2 className="section-title">Historial de pagos</h2>
        {pagos === null ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Registro</th><th>Periodo</th><th>Tramo</th><th>Meses</th><th>Total</th><th>Método</th><th>Factura</th></tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{fechaCO(p.creadoEn)}</td>
                    <td className="whitespace-nowrap text-sm">{fechaCO(p.desde)} – {fechaCO(p.hasta)}</td>
                    <td>{p.tramo}</td>
                    <td>{p.meses}</td>
                    <td className="whitespace-nowrap">
                      <p className="font-semibold">{cop(p.total)}</p>
                      <p className="text-sm text-muted">Base {cop(p.valorBase)} · IVA {cop(p.valorIva)}</p>
                    </td>
                    <td>{METODOS[p.metodo] ?? p.metodo}{p.referencia && <p className="text-sm text-muted">{p.referencia}</p>}</td>
                    <td className="min-w-56">
                      {editando?.id === p.id ? (
                        <div className="space-y-2">
                          <input aria-label="Número de factura" maxLength={60} className="field" placeholder="N.º de factura"
                            value={editando.numero} onChange={(e) => setEditando({ ...editando, numero: e.target.value })} />
                          <input aria-label="Fecha de factura" type="date" className="field"
                            value={editando.fecha} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />
                          <div className="flex gap-2">
                            <button type="button" onClick={guardarFactura} className="btn-primary btn-sm">Guardar</button>
                            <button type="button" onClick={() => setEditando(null)} className="btn-gray btn-sm">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {p.facturaNumero ? (
                            <span>
                              <strong>{p.facturaNumero}</strong>
                              {p.facturaFecha && <span className="text-sm text-muted"> · {p.facturaFecha}</span>}
                            </span>
                          ) : (
                            <span className="tag-warning">Sin factura</span>
                          )}
                          <button type="button" className="btn-link text-sm"
                            onClick={() => setEditando({ id: p.id, numero: p.facturaNumero ?? '', fecha: p.facturaFecha ?? '' })}>
                            Editar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {pagos.length === 0 && <tr><td colSpan={7} className="text-muted">Aún no hay pagos registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
