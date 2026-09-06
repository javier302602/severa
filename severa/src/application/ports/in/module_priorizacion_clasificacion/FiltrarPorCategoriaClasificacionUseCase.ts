import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';

export interface FiltrarPorCategoriaClasificacionUseCase {
  ejecutar(severidad: string, analistaId: string): Promise<Vulnerabilidad[]>;
}
