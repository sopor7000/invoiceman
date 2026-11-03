import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Protected from './components/Protected';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Recuperar from './pages/Recuperar';
import Restablecer from './pages/Restablecer';
import LegalizarManual from './pages/LegalizarManual';
import LegalizarExtranjera from './pages/LegalizarExtranjera';
import LegalizarElectronica from './pages/LegalizarElectronica';
import Ayuda from './pages/Ayuda';
import Viaticos from './pages/Viaticos';
import MisSolicitudes from './pages/MisSolicitudes';
import Configuracion from './pages/Configuracion';
import Bandeja from './pages/Bandeja';
import AprobarViaticos from './pages/AprobarViaticos';
import Superadmin from './pages/Superadmin';
import Estadisticas from './pages/Estadisticas';
import Plan from './pages/Plan';
import SuperEmpresa from './pages/SuperEmpresa';

// Páginas que llegan en las siguientes entregas
const Pronto = ({ titulo }) => (
  <div className="space-y-4">
    <h1 className="page-title">{titulo}</h1>
    <div className="alert-info">Esta sección estará disponible en la próxima entrega.</div>
  </div>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/restablecer" element={<Restablecer />} />
      <Route path="/bienvenida" element={<Onboarding />} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Home />} />
        <Route path="/legalizar/manual" element={<LegalizarManual />} />
        <Route path="/legalizar/extranjera" element={<LegalizarExtranjera />} />
        <Route path="/legalizar/electronica" element={<LegalizarElectronica />} />
        <Route path="/ayuda" element={<Ayuda />} />
        <Route path="/viaticos" element={<Viaticos />} />
        <Route path="/mis-solicitudes" element={<MisSolicitudes />} />
        <Route path="/viaticos/aprobacion" element={<Protected roles={['approver']}><AprobarViaticos /></Protected>} />
        <Route path="/inbox" element={<Protected roles={['admin']}><Bandeja /></Protected>} />
        <Route path="/estadisticas" element={<Protected roles={['admin']}><Estadisticas /></Protected>} />
        <Route path="/configuracion" element={<Protected roles={['admin']}><Configuracion /></Protected>} />
        <Route path="/plan" element={<Protected roles={['admin']}><Plan /></Protected>} />
        <Route path="/super" element={<Protected roles={['super']}><Superadmin /></Protected>} />
        <Route path="/super/empresa/:id" element={<Protected roles={['super']}><SuperEmpresa /></Protected>} />
      </Route>

      <Route path="*" element={<Login />} />
    </Routes>
  );
}