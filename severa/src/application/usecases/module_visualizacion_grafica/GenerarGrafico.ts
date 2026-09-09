import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { GenerarGraficoUseCase, TipoGrafico } from '../../ports/in/module_visualizacion_grafica/GenerarGraficoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { GraficosOutputPort } from '../../ports/out/graphics/GraficosOutputPort';
import {
  DatosHistogramaCvss,
  generarDatosHistograma,
  generarDatosHistogramaAgrupado,
  contarPorCategoria,
  generarTopN,
  generarTopTiposClasificados,
  generarDatosPromedioPorCategoria,
  generarDatosHistogramaDiasParche
} from '../../../domain/services/graphs/GraficosEstadisticos';
import { calcularResumenCincoNumeros, calcularMedia, calcularMediana } from '../../../domain/services/descriptive-statistics/EstadisticaDescriptiva';
import { calcularCorrelacionPearson } from '../../../domain/services/descriptive-statistics/Correlacion';
import { generarTablaAgrupada, generarIntervalosEquiespaciados, calcularCantidadIntervalosAutomatica } from '../../../domain/services/descriptive-statistics/DistribucionFrecuencias';
import { minimoDe, maximoDe } from '../../../domain/services/MinMax';
import {
  obtenerValorNumerico,
  esVariableNumericaValida,
  esVariableCategoricaValida,
  VariableNumericaVulnerabilidad,
  VariableCategoricaVulnerabilidad
} from '../../../domain/services/classification/VariablesVulnerabilidad';
import { VariableDeConsultaInvalidaError } from '../../../domain/errors/VariableDeConsultaInvalidaError';
import {
  interpretarHistogramaCvss,
  interpretarBarrasSeveridad,
  interpretarBarrasPorCategoria,
  interpretarPastelSeveridad,
  interpretarBoxplotCvss,
  interpretarHistogramaAgrupado,
  interpretarCvssPorAcceso,
  interpretarPromedioPorCategoria,
  interpretarDispersionCvssDias,
  interpretarHistogramaDiasParche,
  interpretarTopTipos,
  interpretarTopSoftware
} from '../../../domain/services/graphs/InterpretacionDeGraficos';

// M-07 (retoma, RF-51): capa de texto por variable numérica — mismo patrón
// que ETIQUETAS_VARIABLE en GenerarDistribucionFrecuencias.ts (M-05), acá
// con título de gráfico + etiqueta de eje + función de interpretación
// (reutilizando las que ya existen, sin escribir prosa nueva: la de
// diasParaParche ya se había escrito para el tipo de gráfico
// 'histogramaDiasParche', que queda coexistiendo sin cambios). El valor de
// 'cvssScore' es textualmente idéntico al título/etiqueta que ya usaba el
// código antes de esta ronda — retrocompatible por construcción.
const TEXTO_HISTOGRAMA: Record<
  VariableNumericaVulnerabilidad,
  { titulo: string; etiquetaEje: string; interpretar: (datos: DatosHistogramaCvss) => string }
> = {
  cvssScore: { titulo: 'Histograma de CVSS', etiquetaEje: 'CVSS Score', interpretar: interpretarHistogramaCvss },
  diasParaParche: { titulo: 'Histograma de días para parche', etiquetaEje: 'Días para parche', interpretar: interpretarHistogramaDiasParche }
};

// M-07 (retoma, RF-52/53/56/57): capa de texto por variable categórica —
// 'severidad' es textualmente idéntica a lo que ya usaba el código
// ("Barras por severidad", "Distribución por severidad", eje "Severidad").
const TEXTO_CATEGORIA: Record<VariableCategoricaVulnerabilidad, { tituloSufijo: string; etiquetaEje: string }> = {
  severidad: { tituloSufijo: 'por severidad', etiquetaEje: 'Severidad' },
  tipoAcceso: { tituloSufijo: 'por tipo de acceso', etiquetaEje: 'Tipo de acceso' },
  estadoRemediacion: { tituloSufijo: 'por estado de remediación', etiquetaEje: 'Estado de remediación' }
};

function resolverVariableNumerica(valor: string | undefined, porDefecto: VariableNumericaVulnerabilidad): VariableNumericaVulnerabilidad {
  if (valor === undefined) return porDefecto;
  if (!esVariableNumericaValida(valor)) {
    throw new VariableDeConsultaInvalidaError(`"${valor}" no es una variable numérica válida (cvssScore, diasParaParche)`);
  }
  return valor;
}

function resolverVariableCategorica(valor: string | undefined, porDefecto: VariableCategoricaVulnerabilidad): VariableCategoricaVulnerabilidad {
  if (valor === undefined) return porDefecto;
  if (!esVariableCategoricaValida(valor)) {
    throw new VariableDeConsultaInvalidaError(`"${valor}" no es una variable categórica válida (tipoAcceso, estadoRemediacion, severidad)`);
  }
  return valor;
}

// RF-51: mismo criterio que ya usa GenerarDistribucionFrecuencias.ts (M-05)
// para su histograma agrupado — sin un rango fijo de negocio (a diferencia
// de cvssScore), se reparte el rango REAL de los datos, con la cantidad de
// intervalos automática (Sturges) si el analista no la fuerza. Reusa las
// mismas funciones de dominio ya compartidas por ambos pipelines, sin
// escribir un algoritmo de binning nuevo.
function construirHistogramaAgrupadoGenerico(valores: number[], etiqueta: string): DatosHistogramaCvss {
  const intervalos = generarIntervalosEquiespaciados(minimoDe(valores), maximoDe(valores), calcularCantidadIntervalosAutomatica(valores.length));
  const tabla = generarTablaAgrupada(valores, intervalos, etiqueta);
  return {
    bins: tabla.map((fila) => ({ intervalo: fila.intervalo, frecuencia: fila.frecuenciaAbsoluta })),
    media: calcularMedia(valores, etiqueta),
    mediana: calcularMediana(valores, etiqueta)
  };
}

export class GenerarGrafico implements GenerarGraficoUseCase {
  constructor(
    private readonly vulnerabilidadRepository: VulnerabilidadRepository,
    private readonly graficosOutputPort: GraficosOutputPort
  ) {}

  async ejecutar(
    tipo: TipoGrafico,
    analistaId: string,
    opciones: { limite?: number; formato?: 'svg' | 'json' | 'png' | 'pdf'; variable?: string; variableAgrupacion?: string; variableValor?: string } = {},
    vulnerabilidades?: Vulnerabilidad[]
  ): Promise<unknown> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar(analistaId);
    const scores = lista.map((item) => item.cvssScore.valor);
    const formato = opciones.formato ?? 'svg';

    switch (tipo) {
      case 'histogramaCvss': {
        const variable = resolverVariableNumerica(opciones.variable, 'cvssScore');
        const valores = lista.map((item) => obtenerValorNumerico(item, variable)).filter((v): v is number => v !== undefined);
        const texto = TEXTO_HISTOGRAMA[variable];
        const datos = generarDatosHistograma(valores, { intervalos: 5 }, texto.etiquetaEje);
        const resultado = await this.graficosOutputPort.renderizarHistograma(datos, formato, texto.titulo, texto.etiquetaEje);
        return this.envolver(formato, resultado, () => texto.interpretar(datos));
      }
      case 'histogramaCvssAgrupado': {
        const variable = resolverVariableNumerica(opciones.variable, 'cvssScore');
        const valores = lista.map((item) => obtenerValorNumerico(item, variable)).filter((v): v is number => v !== undefined);
        const etiquetaEje = TEXTO_HISTOGRAMA[variable].etiquetaEje;
        const datos = variable === 'cvssScore' ? generarDatosHistogramaAgrupado(valores) : construirHistogramaAgrupadoGenerico(valores, etiquetaEje);
        const resultado = await this.graficosOutputPort.renderizarHistograma(datos, formato, 'Histograma agrupado', etiquetaEje);
        return this.envolver(formato, resultado, interpretarHistogramaAgrupado);
      }
      case 'barrasSeveridad': {
        const variable = resolverVariableCategorica(opciones.variable, 'severidad');
        const datos = contarPorCategoria(lista, variable);
        const texto = TEXTO_CATEGORIA[variable];
        const resultado = await this.graficosOutputPort.renderizarBarras(datos, formato, `Barras ${texto.tituloSufijo}`, 'Cantidad', texto.etiquetaEje);
        const interpretar = variable === 'severidad' ? () => interpretarBarrasSeveridad(datos) : () => interpretarBarrasPorCategoria(datos, texto.etiquetaEje);
        return this.envolver(formato, resultado, interpretar);
      }
      case 'pastelSeveridad': {
        const variable = resolverVariableCategorica(opciones.variable, 'severidad');
        const datos = contarPorCategoria(lista, variable);
        const texto = TEXTO_CATEGORIA[variable];
        const resultado = await this.graficosOutputPort.renderizarPastel(datos, formato, `Distribución ${texto.tituloSufijo}`);
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
        // RF-56/RF-57 (M-07, retoma): dos ejes independientes, tal como el
        // SDS los separa — RF-56 generaliza la variable de AGRUPACIÓN
        // (default 'tipoAcceso'), RF-57 la variable de VALOR promediado
        // (default 'cvssScore'). Con ambos defaults, el resultado (datos y
        // título/etiquetas) es idéntico al de siempre — generarDatosCvssPorAcceso
        // se retiró (único consumidor era este caso, confirmado en la
        // auditoría de retoma) en favor de generarDatosPromedioPorCategoria,
        // que la reemplaza sin dejar un alias sin uso.
        const variableAgrupacion = resolverVariableCategorica(opciones.variableAgrupacion, 'tipoAcceso');
        const variableValor = resolverVariableNumerica(opciones.variableValor, 'cvssScore');
        const datos = generarDatosPromedioPorCategoria(lista, variableAgrupacion, variableValor);

        const esCasoDefault = variableAgrupacion === 'tipoAcceso' && variableValor === 'cvssScore';
        const etiquetaAgrupacion = TEXTO_CATEGORIA[variableAgrupacion].etiquetaEje;
        const etiquetaValor = TEXTO_HISTOGRAMA[variableValor].etiquetaEje;
        // Título retrocompatible EXACTO para el caso default ("CVSS por tipo
        // de acceso", no "CVSS Score por tipo de acceso") — cualquier otra
        // combinación arma un título genérico pero claro.
        const titulo = esCasoDefault ? 'CVSS por tipo de acceso' : `${etiquetaValor} por ${etiquetaAgrupacion.toLowerCase()}`;

        const resultado = await this.graficosOutputPort.renderizarBarras(datos, formato, titulo, etiquetaValor, etiquetaAgrupacion);
        const interpretar = esCasoDefault ? () => interpretarCvssPorAcceso(datos) : () => interpretarPromedioPorCategoria(datos, etiquetaValor);
        return this.envolver(formato, resultado, interpretar);
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
