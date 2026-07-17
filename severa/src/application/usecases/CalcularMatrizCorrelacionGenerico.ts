import { CalcularMatrizCorrelacionGenericoUseCase } from '../ports/in/CalcularMatrizCorrelacionGenericoUseCase';
import { SesionAnalisisStore } from '../ports/out/SesionAnalisisStore';
import { MatrizCorrelacion, calcularMatrizCorrelacion } from '../../domain/services/CorrelacionGenerico';
import { SesionAnalisisNoEncontradaError } from '../../domain/errors/SesionAnalisisNoEncontradaError';

// Mejora 4 (Análisis de Datos General) — Fase 4.
export class CalcularMatrizCorrelacionGenerico implements CalcularMatrizCorrelacionGenericoUseCase {
  constructor(private readonly sesionAnalisisStore: SesionAnalisisStore) {}

  async ejecutar(analistaId: string, sesionId: string): Promise<MatrizCorrelacion> {
    const datos = this.sesionAnalisisStore.obtener(analistaId, sesionId);
    if (!datos) {
      throw new SesionAnalisisNoEncontradaError();
    }

    return calcularMatrizCorrelacion(datos.columnas, datos.filas);
  }
}
