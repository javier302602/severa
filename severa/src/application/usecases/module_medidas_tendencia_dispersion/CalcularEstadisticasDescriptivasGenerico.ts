import { CalcularEstadisticasDescriptivasGenericoUseCase } from '../../ports/in/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenericoUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { ResumenColumna, calcularEstadisticasDescriptivas } from '../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { esIdentificador } from '../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 3.
export class CalcularEstadisticasDescriptivasGenerico implements CalcularEstadisticasDescriptivasGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string, incluirIdentificadores = false): Promise<ResumenColumna[]> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    const resumenes = calcularEstadisticasDescriptivas(datos.columnas, datos.filas);
    if (incluirIdentificadores) {
      return resumenes;
    }

    // RF-109: el dominio (calcularEstadisticasDescriptivas) no sabe nada de
    // esta regla de exclusión por defecto — es una decisión de API/aplicación,
    // no de cálculo estadístico puro, así que se filtra acá, no ahí.
    const columnasIdentificador = new Set(
      datos.columnas.filter((nombre) => esIdentificador(datos.filas.map((fila) => fila[nombre])))
    );
    return resumenes.filter((resumen) => !columnasIdentificador.has(resumen.nombre));
  }
}
