import { randomUUID } from 'crypto';
import { FiltroFavorito } from '../../../domain/entities/FiltroFavorito';
import { CriteriosFiltroVulnerabilidad } from '../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { GuardarFiltroFavoritoUseCase } from '../../ports/in/module_busqueda_filtros_avanzados/GuardarFiltroFavoritoUseCase';
import { FiltroFavoritoRepository } from '../../ports/out/persistencia/repositorios/FiltroFavoritoRepository';

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
