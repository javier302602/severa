import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { GenerarGraficoUseCase, TipoGrafico } from '../ports/in/GenerarGraficoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { GraficosOutputPort } from '../ports/out/GraficosOutputPort';
import { generarDatosHistogramaCvss, contarPorSeveridad, generarTopN, generarTopTiposClasificados, generarDatosHistogramaAgrupado, generarDatosCvssPorAcceso, generarDatosHistogramaDiasParche } from '../../domain/services/GraficosEstadisticos';
import { calcularResumenCincoNumeros } from '../../domain/services/EstadisticaDescriptiva';
import { calcularCorrelacionPearson } from '../../domain/services/Correlacion';
import {
  interpretarHistogramaCvss,
  interpretarBarrasSeveridad,
  interpretarPastelSeveridad,
  interpretarBoxplotCvss,
  interpretarHistogramaAgrupado,
  interpretarCvssPorAcceso,
  interpretarDispersionCvssDias,
  interpretarHistogramaDiasParche,
  interpretarTopTipos,
  interpretarTopSoftware
} from '../../domain/services/InterpretacionDeGraficos';

export class GenerarGrafico implements GenerarGraficoUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly graficosOutputPort: GraficosOutputPort
  ) {}

  async ejecutar(tipo: TipoGrafico, opciones: { limite?: number; formato?: 'svg' | 'json' | 'png' | 'pdf' } = {}, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar();
    const scores = lista.map((item) => item.cvssScore.valor);
    const formato = opciones.formato ?? 'svg';

    switch (tipo) {
      case 'histogramaCvss': {
        const datos = generarDatosHistogramaCvss(scores, { intervalos: 5 });
        const resultado = await this.graficosOutputPort.renderizarHistograma(datos, formato, 'Histograma de CVSS', 'CVSS Score');
        return this.envolver(formato, resultado, () => interpretarHistogramaCvss(datos));
      }
      case 'histogramaCvssAgrupado': {
        const datos = generarDatosHistogramaAgrupado(scores);
        const resultado = await this.graficosOutputPort.renderizarHistograma(datos, formato, 'Histograma agrupado', 'CVSS Score');
        return this.envolver(formato, resultado, interpretarHistogramaAgrupado);
      }
      case 'barrasSeveridad': {
        const datos = contarPorSeveridad(scores);
        const resultado = await this.graficosOutputPort.renderizarBarras(datos, formato, 'Barras por severidad', 'Cantidad', 'Severidad');
        return this.envolver(formato, resultado, () => interpretarBarrasSeveridad(datos));
      }
      case 'pastelSeveridad': {
        const datos = contarPorSeveridad(scores);
        const resultado = await this.graficosOutputPort.renderizarPastel(datos, formato, 'Distribución por severidad');
        return this.envolver(formato, resultado, interpretarPastelSeveridad);
      }
      case 'boxplotCvss': {
        // Bug real (auditoría de cierre de Mejora 4): antes mandaba
        // { scores, media }, una forma que SvgGraficosAdapter ignoraba por
        // completo (siempre devolvía el mismo placeholder). Al arreglar el
        // adapter para dibujar un boxplot real hace falta el resumen de
        // cinco números completo (min/Q1/mediana/Q3/máx/media) — misma
        // función que ya usa RecopilarDatosDeInforme.ts para el mismo dato.
        const datos = calcularResumenCincoNumeros(scores);
        const resultado = await this.graficosOutputPort.renderizarBoxplot(datos, formato, 'Boxplot de CVSS');
        return this.envolver(formato, resultado, () => interpretarBoxplotCvss(datos));
      }
      case 'dispersionCvssDias': {
        // Bug real (auditoría de cierre de Mejora 4): "y: 0" fijo para
        // TODOS los puntos, sin importar diasParaParche — un diagrama de
        // dispersión que era, en los hechos, una línea plana. Solo las
        // vulnerabilidades con diasParaParche registrado (campo opcional)
        // aportan un punto — mismo criterio que dispersionCvssDias en
        // RecopilarDatosDeInforme.ts.
        const puntos = lista
          .filter((item) => item.diasParaParche !== undefined)
          .map((item) => ({ x: item.cvssScore.valor, y: item.diasParaParche as number }));
        const correlacion = puntos.length >= 2 ? calcularCorrelacionPearson(puntos) : 0;
        const datos = { puntos, correlacion };
        const resultado = await this.graficosOutputPort.renderizarDispersion(datos, formato, 'CVSS vs. días para parche');
        return this.envolver(formato, resultado, () => interpretarDispersionCvssDias(datos));
      }
      case 'cvssPorAcceso': {
        // Bug real reportado con capturas: el eje Y decía "Cantidad" aunque
        // estos valores son promedios de CVSS (calcularMedia), no conteos —
        // mismo rótulo que ya usaba correctamente GeneradorInformePDF.ts para
        // este mismo gráfico en el informe descargable.
        const datos = generarDatosCvssPorAcceso(lista);
        const resultado = await this.graficosOutputPort.renderizarBarras(datos, formato, 'CVSS por tipo de acceso', 'CVSS Score', 'Tipo de acceso');
        return this.envolver(formato, resultado, () => interpretarCvssPorAcceso(datos));
      }
      case 'histogramaDiasParche': {
        const datos = generarDatosHistogramaDiasParche(lista.map((item) => item.diasParaParche ?? 0));
        const resultado = await this.graficosOutputPort.renderizarHistograma(datos, formato, 'Histograma de días para parche', 'Días para parche');
        return this.envolver(formato, resultado, () => interpretarHistogramaDiasParche(datos));
      }
      case 'topSoftware': {
        const datos = generarTopN(lista, 'software', opciones.limite ?? 10);
        const resultado = await this.graficosOutputPort.renderizarBarrasHorizontales(datos, formato, 'Top 10 software', 'Cantidad');
        return this.envolver(formato, resultado, () => interpretarTopSoftware(datos));
      }
      case 'topTipos': {
        // Decisión confirmada con el usuario ante el bug real reportado con
        // capturas: "Sin clasificar" (89.9% del dataset NVD real probado)
        // dominaba tan fuertemente la escala lineal que las 9 categorías
        // reales quedaban invisibles. Se excluye del ranking (no es un tipo
        // de vulnerabilidad real) y se informa aparte en la interpretación.
        const { datos, totalSinClasificar } = generarTopTiposClasificados(lista, opciones.limite ?? 10);
        const resultado = await this.graficosOutputPort.renderizarBarrasHorizontales(datos, formato, 'Top 10 tipos', 'Cantidad');
        return this.envolver(formato, resultado, () => interpretarTopTipos(datos, totalSinClasificar));
      }
      default:
        throw new Error(`Tipo de gráfico no soportado: ${tipo}`);
    }
  }

  // Mejora "interpretación en prosa en la página de Gráficos": solo el
  // formato 'svg' (el único que de verdad usa GraficosPage.tsx — ver
  // graficoService.ts) se envuelve con el texto de análisis, así que el
  // body pasa de ser el string SVG a ser {svg, interpretacion}. Los
  // formatos 'json'/'png'/'pdf' quedan exactamente como estaban (json seguía
  // siendo un passthrough {tipo, datos}; png/pdf el aviso de exportación
  // pendiente) — no hay motivo para tocar esos formatos hoy.
  private envolver(formato: string, resultado: unknown, interpretar: () => string): unknown {
    if (formato !== 'svg') {
      return resultado;
    }
    return { svg: resultado, interpretacion: interpretar() };
  }
}
