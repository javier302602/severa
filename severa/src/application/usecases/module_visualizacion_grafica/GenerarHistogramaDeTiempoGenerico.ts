import { GenerarHistogramaDeTiempoGenericoUseCase } from '../../ports/in/module_visualizacion_grafica/GenerarHistogramaDeTiempoGenericoUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetInvalidoError } from '../../../domain/errors/DatasetInvalidoError';
import { analizarColumnaUnivariado } from '../../../domain/services/descriptive-statistics/AnalisisUnivariadoGenerico';
import { dibujarHistogramaFecha } from '../../../infrastructure/adapters/out/graphics/SvgDibujoDeGraficos';
import { interpretarHistogramaTiempo } from '../../../domain/services/graphs/InterpretacionDeGraficosGenerico';

// RF-58: histograma de una columna de tipo fecha/tiempo de un dataset
// genérico. Separado a propósito de GenerarGrafico.ts (CVSS) — ver
// auditoría SDS M-07. La columna es seleccionada por el analista por
// nombre (igual que /univariado/:nombreColumna); el tipo se infiere en el
// momento de la consulta (inferirTipoColumna, vía analizarColumnaUnivariado),
// no se persiste ningún "tipo" por columna en datasets_genericos.
export class GenerarHistogramaDeTiempoGenerico implements GenerarHistogramaDeTiempoGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(
    analistaId: string,
    sesionId: string,
    nombreColumna: string,
    formato: 'svg' | 'json' = 'svg'
  ): Promise<unknown> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const analisis = analizarColumnaUnivariado(nombreColumna, datos.columnas, datos.filas);
    if (analisis.tipo !== 'fecha') {
      throw new DatasetInvalidoError(`La columna "${nombreColumna}" no es de tipo fecha/tiempo`);
    }

    if (formato === 'json') {
      return analisis;
    }

    const bins = analisis.distribucion.map((entrada) => ({ intervalo: entrada.valor, frecuencia: entrada.frecuenciaAbsoluta }));
    const svg = dibujarHistogramaFecha(bins, analisis.minimo, analisis.maximo, {
      titulo: `Histograma de ${nombreColumna}`,
      etiquetaEjeX: nombreColumna,
      etiquetaEjeY: 'Frecuencia'
    });

    return { svg, interpretacion: interpretarHistogramaTiempo(analisis) };
  }
}
