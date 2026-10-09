import { EliminarPlantillaDeAnalisisUseCase } from '../../ports/in/module_perfil_analista/PlantillasDeAnalisisUseCases';
import { PlantillaDeAnalisisRepository } from '../../ports/out/persistencia/repositorios/PlantillaDeAnalisisRepository';
import { PlantillaDeAnalisisNoEncontradaError } from '../../../domain/errors/PlantillaDeAnalisisErrors';

// RF-12 (M-02). Eliminar una plantilla no deshace nada de lo que ya se aplicó
// con ella: eso quedó en cada dataset, con su bitácora.
export class EliminarPlantillaDeAnalisis implements EliminarPlantillaDeAnalisisUseCase {
  constructor(private readonly plantillaRepository: PlantillaDeAnalisisRepository) {}

  async ejecutar(analistaId: string, plantillaId: string): Promise<void> {
    if (!(await this.plantillaRepository.eliminar(plantillaId, analistaId))) {
      throw new PlantillaDeAnalisisNoEncontradaError();
    }
  }
}
