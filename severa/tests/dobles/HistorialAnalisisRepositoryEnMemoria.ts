import { HistorialAnalisisRepository } from '../../src/application/ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { Paginacion } from '../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { RegistrarEnHistorialDeAnalisisUseCase } from '../../src/application/ports/in/module_perfil_analista/RegistrarEnHistorialDeAnalisisUseCase';
import { AnalisisRealizado } from '../../src/domain/entities/AnalisisRealizado';

// Doble del historial de análisis con las mismas reglas observables que
// PostgresHistorialAnalisisRepository: acotado por analista, del más
// reciente al más antiguo (el id desempata) y un id repetido no se guarda dos
// veces con registrarSiEsNuevo.
export class HistorialAnalisisRepositoryEnMemoria implements HistorialAnalisisRepository {
  readonly eventos: AnalisisRealizado[] = [];

  async registrar(analisis: AnalisisRealizado): Promise<void> {
    if (this.eventos.some((evento) => evento.id === analisis.id)) {
      throw new Error(`duplicate key value violates unique constraint (id ${analisis.id})`);
    }
    this.eventos.push(analisis);
  }

  async registrarSiEsNuevo(analisis: AnalisisRealizado): Promise<boolean> {
    if (this.eventos.some((evento) => evento.id === analisis.id)) return false;
    this.eventos.push(analisis);
    return true;
  }

  async listarPorAnalista(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]> {
    const propios = this.eventos
      .filter((evento) => evento.analistaId === analistaId)
      .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || (a.id < b.id ? 1 : -1));
    return paginacion ? propios.slice(paginacion.offset, paginacion.offset + paginacion.limite) : propios;
  }

  async contarPorAnalista(analistaId: string): Promise<number> {
    return this.eventos.filter((evento) => evento.analistaId === analistaId).length;
  }
}

// Para los tests de decoradores que solo necesitan saber qué se anotó.
export function historialFalso(): jest.Mocked<RegistrarEnHistorialDeAnalisisUseCase> {
  return {
    deSesion: jest.fn().mockResolvedValue(undefined),
    delCatalogo: jest.fn().mockResolvedValue(undefined)
  };
}
