import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { RegistroPage } from './pages/auth/RegistroPage';
import { PerfilPage } from './pages/perfil/PerfilPage';
import { ImportarDatasetPage } from './pages/dataset/ImportarDatasetPage';
import { AnalisisDatosPage } from './pages/analisis-datos/AnalisisDatosPage';
import { CatalogoPage } from './pages/catalogo/CatalogoPage';
import { VulnerabilidadDetallePage } from './pages/catalogo/VulnerabilidadDetallePage';
import { ResumenEstadisticoPage } from './pages/estadisticas/ResumenEstadisticoPage';
import { DistribucionFrecuenciasPage } from './pages/estadisticas/DistribucionFrecuenciasPage';
import { GraficosPage } from './pages/graficos/GraficosPage';
import { RankingPage } from './pages/priorizacion/RankingPage';
import { NotificacionesPage } from './pages/notificaciones/NotificacionesPage';
import { ComparacionPage } from './pages/comparacion/ComparacionPage';
import { InformesPage } from './pages/informes/InformesPage';
import { BusquedaAvanzadaPage } from './pages/busqueda/BusquedaAvanzadaPage';
import { AuditoriaPage } from './pages/auditoria/AuditoriaPage';
import { ComoFuncionaPage } from './pages/como-funciona/ComoFuncionaPage';
import { RUTAS } from './routes/paths';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path={RUTAS.login} element={<LoginPage />} />
          <Route path={RUTAS.registro} element={<RegistroPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to={RUTAS.catalogo} replace />} />
              <Route path={RUTAS.perfil} element={<PerfilPage />} />
              <Route path={RUTAS.dataset} element={<ImportarDatasetPage />} />
              <Route path={RUTAS.analisisDatos} element={<AnalisisDatosPage />} />
              <Route path={RUTAS.catalogo} element={<CatalogoPage />} />
              <Route path={RUTAS.vulnerabilidadDetalle(':cve')} element={<VulnerabilidadDetallePage />} />
              <Route path={RUTAS.estadisticas} element={<ResumenEstadisticoPage />} />
              <Route path={RUTAS.estadisticasFrecuencias} element={<DistribucionFrecuenciasPage />} />
              <Route path={RUTAS.graficos} element={<GraficosPage />} />
              <Route path={RUTAS.comparacion} element={<ComparacionPage />} />
              <Route path={RUTAS.priorizacion} element={<RankingPage />} />
              <Route path={RUTAS.informes} element={<InformesPage />} />
              <Route path={RUTAS.busqueda} element={<BusquedaAvanzadaPage />} />
              <Route path={RUTAS.auditoria} element={<AuditoriaPage />} />
              <Route path={RUTAS.notificaciones} element={<NotificacionesPage />} />
              <Route path={RUTAS.comoFunciona} element={<ComoFuncionaPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to={RUTAS.catalogo} replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
