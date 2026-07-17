import { Analista } from '../../../domain/entities/Analista';

export interface EditarPerfilUseCase {
  ejecutar(input: { id: string; nombre: string; correo: string }): Promise<Analista>;
}
