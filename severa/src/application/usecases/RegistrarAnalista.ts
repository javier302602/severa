import { Analista } from '../../domain/entities/Analista';
import { Correo } from '../../domain/value-objects/Correo';
import { AnalistaRepository } from '../ports/out/AnalistaRepository';
import { HasherDeContrasenas } from '../ports/out/HasherDeContrasenas';
import { CorreoYaRegistradoError } from '../../domain/errors/CorreoYaRegistradoError';

export class RegistrarAnalista {
  constructor(
    private readonly analistaRepository: AnalistaRepository,
    private readonly hasher: HasherDeContrasenas
  ) {}

  async ejecutar(input: {
    id: string;
    nombre: string;
    correo: string;
    contrasena: string;
  }): Promise<Analista> {
    const correo = new Correo(input.correo);

    const existente = await this.analistaRepository.buscarPorCorreo(correo.valor);
    if (existente) {
      throw new CorreoYaRegistradoError();
    }

    const contrasenaHash = await this.hasher.generarHash(input.contrasena);

    // RF-04: el registro público SIEMPRE crea 'analista', sin excepción. Un
    // `rol` distinto no rechaza la request (no delata que el campo existe o
    // se está evaluando) — simplemente se ignora, porque este caso de uso ni
    // siquiera lo recibe como parámetro (ver RegistrarAnalistaUseCase.ts).
    const analista = new Analista(
      input.id,
      input.nombre,
      correo,
      contrasenaHash,
      'analista'
    );

    await this.analistaRepository.guardar(analista);
    return analista;
  }
}
