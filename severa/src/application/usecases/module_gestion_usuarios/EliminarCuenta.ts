import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { HasherDeContrasenas } from '../../ports/out/seguridad/HasherDeContrasenas';
import { EliminarCuentaUseCase } from '../../ports/in/module_gestion_usuarios/EliminarCuentaUseCase';
import { CredencialesInvalidasError } from '../../../domain/errors/CredencialesInvalidasError';

// RF-15: eliminación definitiva de la propia cuenta, previa confirmación con
// la contraseña actual (mismo criterio de la mayoría de sistemas para
// acciones destructivas). Reutiliza exactamente el mismo HasherDeContrasenas
// y la misma CredencialesInvalidasError que IniciarSesion.ts — no duplica
// lógica de verificación de contraseña. El id SIEMPRE debe venir de
// req.analistaAutenticado.id (token verificado) — ver CuentaController —
// nunca de la URL o del body, para que sea imposible borrar la cuenta de
// otro analista.
export class EliminarCuenta implements EliminarCuentaUseCase {
  constructor(
    private readonly analistaRepository: AnalistaRepository,
    private readonly hasher: HasherDeContrasenas
  ) {}

  async ejecutar(id: string, contrasena: string): Promise<void> {
    const analista = await this.analistaRepository.buscarPorId(id);
    if (!analista) {
      throw new Error('Analista no encontrado');
    }

    const valido = await this.hasher.comparar(contrasena, analista.contrasenaHash);
    if (!valido) {
      throw new CredencialesInvalidasError();
    }

    await this.analistaRepository.eliminar(id);
  }
}
