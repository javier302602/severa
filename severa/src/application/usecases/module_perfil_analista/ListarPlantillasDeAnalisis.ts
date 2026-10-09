import { ListarPlantillasDeAnalisisUseCase } from '../../ports/in/module_perfil_analista/PlantillasDeAnalisisUseCases';
import { PlantillaDeAnalisisRepository } from '../../ports/out/persistencia/repositorios/PlantillaDeAnalisisRepository';
import { PlantillaDeAnalisis } from '../../../domain/entities/PlantillaDeAnalisis';

// RF-12 (M-02): las plantillas del analista, de la más nueva a la más vieja.
export class ListarPlantillasDeAnalisis implements ListarPlantillasDeAnalisisUseCase {
  constructor(private readonly plantillaRepository: PlantillaDeAnalisisRepository) {}

  ejecutar(analistaId: string): Promise<PlantillaDeAnalisis[]> {
    return this.plantillaRepository.listarPorAnalista(analistaId);
  }
}
