import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import Spinner from '../components/Spinner';
import { ESTADO_PLAN, hoyCO } from '../utils';

const TRAMOS = ['T1', 'T2', 'T3', 'T4', 'T5'];

// Fecha AAAA-MM-DD en hora de Colombia
const fechaInput = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) : '');

// Suma meses a una fecha AAAA-MM-DD sin saltar de mes (31 ene + 1 mes = 28/29 feb)
function sumarMeses(fecha, meses) {
  const [a, m, d] = fecha.split('-').map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
}

const formDe = (p) => ({
  tramo: p.tramoActual || 'T1',
  limite: p.tramoActual === 'T5' ? String(p.limiteUsuarios ?? '') : '',
  descuento: String(p.descuentoAnualPct ?? 0),
  venceEn: fechaInput(p.venceEn),
  precios: Object.fromEntries(
    TRAMOS.map((c) => [c, String(p.tramos.find((t) => t.codigo === c)?.precioMes ?? '')])
  ),
});

export default function SuperEmpresa() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const aplicar = (p) => { setPlan(p); setF(formDe(p)); };

  const cargar = useCallback(() => {
    api(`/super/tenants/${id}/plan`).then(aplicar).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setPrecio = (c) => (e) => setF({ ...f, precios: { ...f.precios, [c]: e.target.value } });

  // Extiende desde la vigencia actual o, si ya venció, desde hoy
  const extender = (meses) => {
    const hoy = hoyCO();
    const base = f.venceEn && f.venceEn > hoy ? f.venceEn : hoy;
    setF({ ...f, venceEn: sumarMeses(base, meses) });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await api(`/super/tenants/${id}/plan`, {
        method: 'PUT',
        body: {
          tramo: f.tramo,
          limiteUsuarios: f.tramo === 'T5' ? Number(f.limite) : null,
          descuentoAnualPct: Number(f.descuento || 0),
          venceEn: f.venceEn || null,
          precios: Object.fromEntries(TRAMOS.map((c) => [c, f.precios[c] === '' ? null : Number(f.precios[c])])),
        },
      });
      aplicar(r);
      setMsg('Plan guardado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return error ? <div role="alert" className="alert-error"><p>{error}</p></div> : <Spinner />;
  }

  const estado = ESTADO_PLAN[plan.vigencia?.estado] || ESTADO_PLAN.SIN_VIGENCIA;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/super" className="btn-link text-sm">Volver a compañías</Link>
        <h1 className="page-title mt-2">{plan.tenant.nombre}</h1>
        <p className="page-lead">
          NIT {plan.tenant.nit} · {plan.usuariosActivos} usuarios activos · <span className={estado.tag}>{estado.texto}</span>
        </p>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div role="status" className="alert-success"><p>{msg}</p></div>}

      <form onSubmit={guardar} className="space-y-8">
        <section className="card space-y-4">
          <h2 className="section-title">Tramo</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="tramo" className="label">Tramo asignado</label>
              <select id="tramo" className="field" value={f.tramo} onChange={set('tramo')}>
                {plan.tramos.map((t) => <option key={t.codigo} value={t.codigo}>{t.codigo}: {t.nombre}</option>)}
              </select>
            </div>
            {f.tramo === 'T5' && (
              <div>
                <label htmlFor="limite" className="label">Límite pactado de usuarios</label>
                <input id="limite" type="number" min={501} step={1} required className="field"
                  value={f.limite} onChange={set('limite')} />
                <span className="hint">Mínimo 501.</span>
              </div>
            )}
            <div>
              <label htmlFor="descuento" className="label">Descuento por pago anual (%)</label>
              <input id="descuento" type="number" min={0} max={100} step="0.01" required className="field"
                value={f.descuento} onChange={set('descuento')} />
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="section-title">Precios mensuales</h2>
          <p className="text-muted">Valor mensual en COP con IVA incluido. Deja el campo vacío para no ofrecer ese tramo.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {plan.tramos.map((t) => (
              <div key={t.codigo}>
                <label htmlFor={`precio-${t.codigo}`} className="label">{t.codigo}</label>
                <input id={`precio-${t.codigo}`} type="number" min={1} step="0.01" inputMode="decimal" className="field"
                  value={f.precios[t.codigo]} onChange={setPrecio(t.codigo)} />
                <span className="hint">{t.nombre}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="section-title">Vigencia</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="venceEn" className="label">Vence el</label>
              <input id="venceEn" type="date" className="field" value={f.venceEn} onChange={set('venceEn')} />
            </div>
            <button type="button" className="btn-secondary" onClick={() => extender(1)}>+1 mes</button>
            <button type="button" className="btn-secondary" onClick={() => extender(12)}>+12 meses</button>
          </div>
          <span className="hint">El plan vence al final del día indicado, en hora de Colombia.</span>
        </section>

        <button disabled={busy} className="btn-primary">{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </div>
  );
}
