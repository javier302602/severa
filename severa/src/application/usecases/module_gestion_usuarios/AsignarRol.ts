import { Analista, RolAnalista } from '../../../domain/entities/Analista';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { AsignarRolUseCase } from '../../ports/in/module_gestion_usuarios/AsignarRolUseCase';
import { RolInvalidoError } from '../../../domain/errors/RolInvalidoError';

const ROLES_VALIDOS: RolAnalista[] = ['analista', 'administrador'];

export class AsignarRol implements AsignarRolUseCase {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(input: { analistaId: string; nuevoRol: RolAnalista }): Promise<Analista> {
    if (!ROLES_VALIDOS.includes(input.nuevoRol)) {
      throw new RolInvalidoError(input.nuevoRol);
    }

    const analista = await this.analistaRepository.buscarPorId(input.analistaId);
    if (!analista) {
      throw new Error('Analista no encontrado');
    }

    analista.rol = input.nuevoRol;
    await this.analistaRepository.guardar(analista);
    return analista;
  }
}
