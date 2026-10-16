import { useCallback, useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, descargar } from '../api/client';
import Spinner from '../components/Spinner';
import { cop } from '../utils';

const ETIQ_TIPO = { ELECTRONICA: 'Electrónica', MANUAL: 'Manual', EXTRANJERA: 'Extranjera' };
// Azul, rojo y grises de la paleta
const COLORES = ['#0a3161', '#b31942', '#52606d', '#1d5199', '#d12a56', '#7b8794', '#a9c4e6', '#8c1233'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

function Kpi({ titulo, valor, color }) {
  return (
    <div className="card card-hover">
      <p className="text-sm font-bold uppercase tracking-wide text-muted">{titulo}</p>
      <p className="mt-1 text-3xl font-extrabold" style={{ color }}>{valor}</p>
    </div>
  );
}

export default function Estadisticas() {
  const [f, setF] = useState({ desde: '', hasta: '', meses: 12 });
  const [d, setD] = useState(null);
  const [metrica, setMetrica] = useState('cantidades');
  const [estado, setEstado] = useState('APROBADA');
  const [error, setError] = useState('');
  const [bajando, setBajando] = useState(false);

  const query = useCallback(() => {
    const q = new URLSearchParams({ meses: f.meses });
    if (f.desde) q.set('desde', f.desde);
    if (f.hasta) q.set('hasta', f.hasta);
    return q;
  }, [f]);

  useEffect(() => {
    setD(null);
    setError('');
    api(`/stats/summary?${query()}`).then(setD).catch((e) => { setError(e.message); setD(false); });
  }, [query]);

  const exportar = async () => {
    setBajando(true);
    setError('');
    const q = new URLSearchParams({ estado });
    if (f.desde) q.set('desde', f.desde);
    if (f.hasta) q.set('hasta', f.hasta);
    try {
      await descargar(`/stats/export?${q}`, 'legalizaciones.xlsx');
    } catch (e) {
      setError(e.message);
    } finally {
      setBajando(false);
    }
  };

  const tendencia = d
    ? d.tendencia.meses.map((m, i) => {
        const fila = { mes: etiquetaMes(m) };
        d.tendencia.series.forEach((s) => { fila[s.concepto] = s[metrica][i]; });
        return fila;
      })
    : [];
  const fmtEje = (v) => (metrica === 'valores' ? new Intl.NumberFormat('es-CO', { notation: 'compact' }).format(v) : v);

  const porTipo = d ? d.porTipo.map((t) => ({ ...t, nombre: ETIQ_TIPO[t.tipo] })) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Estadísticas</h1>
        <p className="page-lead">Indicadores de legalización de tu compañía. Los viáticos no se incluyen.</p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="d1" className="label">Desde</label>
          <input id="d1" type="date" className="field" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
        </div>
        <div>
          <label htmlFor="d2" className="label">Hasta</label>
          <input id="d2" type="date" className="field" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
        </div>
        <div>
          <label htmlFor="d3" className="label">Meses de la tendencia</label>
          <select id="d3" className="field" value={f.meses} onChange={(e) => setF({ ...f, meses: Number(e.target.value) })}>
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Últimos {n}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full" onClick={() => setF({ desde: '', hasta: '', meses: 12 })}>Limpiar filtros</button>
        </div>
      </div>

      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}

      {d === null ? <Spinner /> : d === false ? null : (
        <>
          <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi titulo="Total" valor={d.totales.total} color="#0a3161" />
            <Kpi titulo="Aprobadas" valor={d.totales.aprobadas} color="#2e7d4f" />
            <Kpi titulo="Rechazadas" valor={d.totales.rechazadas} color="#b31942" />
            <Kpi titulo="Pendientes" valor={d.totales.pendientes} color="#b45309" />
            <Kpi titulo="Valor aprobado" valor={cop(d.totales.valorAprobado)} color="#0a3161" />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="section-title">Facturas por tipo de legalización</h2>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={porTipo}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e7eb" />
                    <XAxis dataKey="nombre" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="aprobadas" name="Aprobadas" stackId="a" fill="#0a3161" />
                    <Bar dataKey="pendientes" name="Pendientes" stackId="a" fill="#7b8794" />
                    <Bar dataKey="rechazadas" name="Rechazadas" stackId="a" fill="#b31942" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title">Facturas por concepto</h2>
              {d.porConcepto.length === 0 ? <p className="text-muted">Sin datos en el rango.</p> : (
                <div style={{ height: Math.max(288, d.porConcepto.length * 44) }}>
                  <ResponsiveContainer>
                    <BarChart data={d.porConcepto} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e7eb" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="concepto" width={120} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="aprobadas" name="Aprobadas" stackId="a" fill="#0a3161" />
                      <Bar dataKey="pendientes" name="Pendientes" stackId="a" fill="#7b8794" />
                      <Bar dataKey="rechazadas" name="Rechazadas" stackId="a" fill="#b31942" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-title flex-1">Tendencia mensual de facturas aprobadas por concepto</h2>
              <div className="flex gap-2" role="group" aria-label="Métrica">
                <button onClick={() => setMetrica('cantidades')} className={metrica === 'cantidades' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>Cantidad</button>
                <button onClick={() => setMetrica('valores')} className={metrica === 'valores' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>Valor (COP)</button>
              </div>
            </div>
            {d.tendencia.series.length === 0 ? (
              <p className="text-muted">Aún no hay facturas aprobadas en este periodo.</p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={tendencia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e7eb" />
                    <XAxis dataKey="mes" />
                    <YAxis allowDecimals={false} tickFormatter={fmtEje} />
                    <Tooltip formatter={(v) => (metrica === 'valores' ? cop(v) : v)} />
                    <Legend />
                    {d.tendencia.series.map((s, i) => (
                      <Line key={s.concepto} type="monotone" dataKey={s.concepto} stroke={COLORES[i % COLORES.length]}
                        strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="card space-y-4">
            <h2 className="section-title">Descargar a Excel</h2>
            <p className="text-muted">
              Columnas: identificación y nombre del usuario, concepto, NIT y nombre del comercio, valor (COP) y tipo de
              legalización. Respeta el rango de fechas de arriba.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="est" className="label">Estado</label>
                <select id="est" className="field" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  <option value="APROBADA">Solo aprobadas</option>
                  <option value="RECHAZADA">Solo rechazadas</option>
                  <option value="PENDIENTE">Solo pendientes</option>
                  <option value="TODAS">Todas</option>
                </select>
              </div>
              <button onClick={exportar} disabled={bajando} className="btn-red">
                {bajando ? 'Generando…' : 'Descargar Excel'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}