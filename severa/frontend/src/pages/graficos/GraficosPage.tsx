import { TarjetaGrafico } from '../../components/graficos/TarjetaGrafico';
import type { TipoGrafico } from '../../api/graficoService';

// M-07 (RF-51 a RF-61): los 10 gráficos del análisis estadístico.
const GRAFICOS: Array<{ tipo: TipoGrafico; titulo: string; limite?: number }> = [
  { tipo: 'histogramaCvss', titulo: 'Histograma de CVSS Score' },
  { tipo: 'histogramaCvssAgrupado', titulo: 'Histograma de CVSS (intervalos agrupados)' },
  { tipo: 'barrasSeveridad', titulo: 'Barras por severidad' },
  { tipo: 'pastelSeveridad', titulo: 'Distribución por severidad' },
  { tipo: 'boxplotCvss', titulo: 'Boxplot de CVSS' },
  { tipo: 'dispersionCvssDias', titulo: 'Dispersión: CVSS vs. días para parche' },
  { tipo: 'cvssPorAcceso', titulo: 'CVSS promedio por tipo de acceso' },
  { tipo: 'histogramaDiasParche', titulo: 'Histograma de días para parche' },
  { tipo: 'topSoftware', titulo: 'Top 10 software más afectado', limite: 10 },
  { tipo: 'topTipos', titulo: 'Top 10 tipos de vulnerabilidad', limite: 10 }
];

export function GraficosPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Gráficos</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {GRAFICOS.map(({ tipo, titulo, limite }) => (
          <TarjetaGrafico key={tipo} tipo={tipo} titulo={titulo} limite={limite} />
        ))}
      </div>
    </div>
  );
}
