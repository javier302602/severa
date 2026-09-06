import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { EliminarCuentaUseCase } from '../../ports/in/module_gestion_usuarios/EliminarCuentaUseCase';

// RF-98/RF-15: eliminación definitiva de la propia cuenta. El id SIEMPRE debe
// venir de req.analistaAutenticado.id (token verificado) — ver
// PerfilController — nunca de la URL o del body, para que sea imposible
// borrar la cuenta de otro analista.
export class EliminarCuenta implements EliminarCuentaUseCase {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(id: string): Promise<void> {
    await this.analistaRepository.eliminar(id);
  }
}
