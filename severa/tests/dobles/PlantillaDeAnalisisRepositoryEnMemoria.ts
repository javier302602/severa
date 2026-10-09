import { PlantillaDeAnalisisRepository } from '../../src/application/ports/out/persistencia/repositorios/PlantillaDeAnalisisRepository';
import { PlantillaDeAnalisis } from '../../src/domain/entities/PlantillaDeAnalisis';
import { NombreDePlantillaRepetidoError } from '../../src/domain/errors/PlantillaDeAnalisisErrors';

// Doble de prueba con las mismas reglas observables que
// PostgresPlantillaDeAnalisisRepository: todo acotado por analista y nombre
// único por analista sin distinguir mayúsculas. Que el repositorio real las
// cumpla contra una base de verdad se prueba en
// tests/integration/PostgresPlantillaDeAnalisisRepository.integration.test.ts.
export class PlantillaDeAnalisisRepositoryEnMemoria implements PlantillaDeAnalisisRepository {
  readonly plantillas: PlantillaDeAnalisis[] = [];

  async guardar(plantilla: PlantillaDeAnalisis): Promise<void> {
    const clave = PlantillaDeAnalisis.claveDeNombre(plantilla.nombre);
    const repetida = this.plantillas.some(
      (otra) => otra.analistaId === plantilla.analistaId && PlantillaDeAnalisis.claveDeNombre(otra.nombre) === clave
    );
    if (repetida) {
      throw new NombreDePlantillaRepetidoError(plantilla.nombre);
    }
    this.plantillas.push(plantilla);
  }

  async listarPorAnalista(analistaId: string): Promise<PlantillaDeAnalisis[]> {
    return this.plantillas
      .filter((plantilla) => plantilla.analistaId === analistaId)
      .sort((a, b) => b.fechaCreacion.getTime() - a.fechaCreacion.getTime());
  }

  async buscarPorId(id: string, analistaId: string): Promise<PlantillaDeAnalisis | null> {
    return this.plantillas.find((plantilla) => plantilla.id === id && plantilla.analistaId === analistaId) ?? null;
  }

  async eliminar(id: string, analistaId: string): Promise<boolean> {
    const indice = this.plantillas.findIndex((plantilla) => plantilla.id === id && plantilla.analistaId === analistaId);
    if (indice === -1) return false;
    this.plantillas.splice(indice, 1);
    return true;
  }
}
