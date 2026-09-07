import { Analista, RolAnalista } from '../../../../domain/entities/Analista';

export interface AsignarRolUseCase {
  ejecutar(input: { analistaId: string; nuevoRol: RolAnalista }): Promise<Analista>;
}
