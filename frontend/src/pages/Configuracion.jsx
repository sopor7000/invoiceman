import { useState } from 'react';
import Conceptos from './config/Conceptos';
import TopeViaticos from './config/TopeViaticos';
import Usuarios from './config/Usuarios';
import Informacion from './config/Informacion';
import BaseDian from './config/BaseDian';
import AyudaConfig from './config/AyudaConfig';

const TABS = [
  { id: 'usuarios', nombre: 'Usuarios', vista: () => <Usuarios /> },
  { id: 'cfact', nombre: 'Conceptos de facturas', vista: () => <Conceptos tipo="FACTURA" /> },
  { id: 'cvia', nombre: 'Conceptos de viáticos', vista: () => <Conceptos tipo="VIATICO" /> },
  { id: 'tope', nombre: 'Tope de viáticos', vista: () => <TopeViaticos /> },
  { id: 'info', nombre: 'Información', vista: () => <Informacion /> },
  { id: 'dian', nombre: 'Base DIAN', vista: () => <BaseDian /> },
  { id: 'ayuda', nombre: 'Ayuda', vista: () => <AyudaConfig /> },
];

export default function Configuracion() {
  const [tab, setTab] = useState('usuarios');
  const actual = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Configuración</h1>
        <p className="page-lead">Administra los parámetros de tu compañía.</p>
      </div>

      <div role="tablist" aria-label="Secciones de configuración" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={tab === t.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
            {t.nombre}
          </button>
        ))}
      </div>

      <section role="tabpanel" key={tab}>{actual.vista()}</section>
    </div>
  );
}