import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';

export interface CalcularResumenEstadisticoUseCase {
  ejecutar(analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<{
    media: number;
    mediana: number;
    moda: number[];
    q1: number;
    q3: number;
    rango: number;
    varianza: number;
    desviacionEstandar: number;
    coeficienteVariacion: number;
  }>;
}
