import { CalcularEstadisticasDescriptivasGenericoUseCase } from '../../ports/in/module_medidas_tendencia_dispersion/CalcularEstadisticasDescriptivasGenericoUseCase';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { ResumenColumna, calcularEstadisticasDescriptivas } from '../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';
import { SesionAnalisisNoEncontradaError } from '../../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 3.
export class CalcularEstadisticasDescriptivasGenerico implements CalcularEstadisticasDescriptivasGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string): Promise<ResumenColumna[]> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    return calcularEstadisticasDescriptivas(datos.columnas, datos.filas);
  }
}
