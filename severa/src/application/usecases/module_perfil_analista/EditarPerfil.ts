import { Analista } from '../../../domain/entities/Analista';
import { AnalistaRepository } from '../../ports/out/persistencia/repositorios/AnalistaRepository';
import { Correo } from '../../../domain/shared/value-objects/Correo';
import { CorreoYaRegistradoError } from '../../../domain/errors/CorreoYaRegistradoError';

export class EditarPerfil {
  constructor(private readonly analistaRepository: AnalistaRepository) {}

  async ejecutar(input: { id: string; nombre: string; correo: string }): Promise<Analista> {
    const analista = await this.analistaRepository.buscarPorId(input.id);
    if (!analista) {
      throw new Error('Analista no encontrado');
    }

    const correo = new Correo(input.correo);

    // Mismo criterio que RegistrarAnalista.ts: valida acá, antes de guardar,
    // en vez de dejar que suba el UNIQUE de Postgres sin capturar — eso
    // permitía inferir, por la diferencia 200 vs 400, qué correos ya están
    // registrados en la plataforma (oráculo de enumeración). Se excluye al
    // propio analista de la comprobación: reenviar el mismo correo que ya
    // tenía (sin cambiarlo) no es un duplicado.
    const existente = await this.analistaRepository.buscarPorCorreo(correo.valor);
    if (existente && existente.id !== analista.id) {
      throw new CorreoYaRegistradoError();
    }

    analista.actualizarPerfil(input.nombre, correo);
    await this.analistaRepository.guardar(analista);
    return analista;
  }
}
