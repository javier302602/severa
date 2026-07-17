import { Analista } from '../../domain/entities/Analista';
import { AnalistaRepository } from '../ports/out/AnalistaRepository';
import { Correo } from '../../domain/value-objects/Correo';

export class EditarPerfil {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(input: { id: string; nombre: string; correo: string }): Promise<Analista> {
    const analista = await this.analistaRepository.buscarPorId(input.id);
    if (!analista) {
      throw new Error('Analista no encontrado');
    }

    analista.actualizarPerfil(input.nombre, new Correo(input.correo));
    await this.analistaRepository.guardar(analista);
    return analista;
  }
}
