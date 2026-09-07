import { randomUUID } from 'crypto';
import { AnalisisRealizado } from '../../../domain/entities/AnalisisRealizado';
import { HistorialAnalisisRepository } from '../../ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { RegistrarAnalisisRealizadoUseCase } from '../../ports/in/module_perfil_analista/RegistrarAnalisisRealizadoUseCase';

// RF-11: puerto de escritura genérico. Sin productor conectado todavía (ver
// container.ts) — lo invocarán los módulos que generan análisis reales
// cuando se auditen (M-05 a M-09).
export class RegistrarAnalisisRealizado implements RegistrarAnalisisRealizadoUseCase {
  constructor(private readonly historialAnalisisRepository: HistorialAnalisisRepository) {}

  async ejecutar(input: { analistaId: string; tipoEvento: string; payload: Record<string, unknown> }): Promise<AnalisisRealizado> {
    const analisis = new AnalisisRealizado(randomUUID(), input.analistaId, input.tipoEvento, input.payload);
    await this.historialAnalisisRepository.registrar(analisis);
    return analisis;
  }
}
