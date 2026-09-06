import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';

export interface FiltrarPorRangoDeVariableUseCase {
  ejecutar(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]>;
}
