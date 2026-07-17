import { randomUUID } from 'crypto';
import { FiltroFavorito } from '../../domain/entities/FiltroFavorito';
import { CriteriosFiltroVulnerabilidad } from '../../domain/value-objects/FiltroVulnerabilidad';
import { GuardarFiltroFavoritoUseCase } from '../ports/in/GuardarFiltroFavoritoUseCase';
import { FiltroFavoritoRepository } from '../ports/out/FiltroFavoritoRepository';

export class GuardarFiltroFavorito implements GuardarFiltroFavoritoUseCase {
  constructor(private readonly filtroFavoritoRepository: FiltroFavoritoRepository) {}

  async ejecutar(input: {
    analistaId: string;
    nombre: string;
    criterios: CriteriosFiltroVulnerabilidad;
  }): Promise<FiltroFavorito> {
    const filtroFavorito = new FiltroFavorito(randomUUID(), input.analistaId, input.nombre, input.criterios);
    await this.filtroFavoritoRepository.guardar(filtroFavorito);
    return filtroFavorito;
  }
}
