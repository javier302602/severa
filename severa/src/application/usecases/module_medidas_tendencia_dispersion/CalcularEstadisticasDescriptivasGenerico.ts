import { CalcularEstadisticasDescriptivasGenericoUseCase } from '../../ports/in/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenericoUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { ResumenColumna, calcularEstadisticasDescriptivas } from '../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { resolverTipoColumnaDetallado } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 3.
export class CalcularEstadisticasDescriptivasGenerico implements CalcularEstadisticasDescriptivasGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string, incluirIdentificadores = false): Promise<ResumenColumna[]> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const resumenes = calcularEstadisticasDescriptivas(datos.columnas, datos.filas, datos.tiposCorregidos);
    if (incluirIdentificadores) {
      return resumenes;
    }

    // RF-109: el dominio (calcularEstadisticasDescriptivas) no sabe nada de
    // esta regla de exclusión por defecto — es una decisión de API/aplicación,
    // no de cálculo estadístico puro, así que se filtra acá, no ahí. El tipo
    // es el vigente (RF-111): una columna que el analista marcó como
    // identificador también queda fuera, y una que desmarcó vuelve a entrar.
    const columnasIdentificador = new Set(
      datos.columnas.filter(
        (nombre) =>
          resolverTipoColumnaDetallado(
            nombre,
            datos.filas.map((fila) => fila[nombre]),
            datos.tiposCorregidos
          ) === 'identificador'
      )
    );
    return resumenes.filter((resumen) => !columnasIdentificador.has(resumen.nombre));
  }
}
