import { Analista } from '../../../domain/entities/Analista';

export interface VerPerfilUseCase {
  ejecutar(id: string): Promise<Analista>;
}
