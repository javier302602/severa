import { Analista } from '../../domain/entities/Analista';
import { AnalistaRepository } from '../ports/out/AnalistaRepository';
import { VerPerfilUseCase } from '../ports/in/VerPerfilUseCase';

// RF-09: mostrar nombre, correo y rol del analista autenticado. El id
// siempre llega desde req.analistaAutenticado.id (ver PerfilController) —
// nunca de params/query, así que no hay forma de pedir el perfil de otro.
export class VerPerfil implements VerPerfilUseCase {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(id: string): Promise<Analista> {
    const analista = await this.analistaRepository.buscarPorId(id);
    if (!analista) {
      throw new Error('Analista no encontrado');
    }
    return analista;
  }
}
