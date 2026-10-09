import { PlantillaDeAnalisis } from '../../../../../domain/entities/PlantillaDeAnalisis';

// RF-12 (M-02). Todo acotado por analista: una plantilla de otro se trata
// igual que una que no existe.
export interface PlantillaDeAnalisisRepository {
  // Lanza NombreDePlantillaRepetidoError si el analista ya tiene una con el
  // mismo nombre (sin distinguir mayúsculas ni espacios al borde). Nunca
  // sobrescribe.
  guardar(plantilla: PlantillaDeAnalisis): Promise<void>;
  // De la más nueva a la más vieja.
  listarPorAnalista(analistaId: string): Promise<PlantillaDeAnalisis[]>;
  buscarPorId(id: string, analistaId: string): Promise<PlantillaDeAnalisis | null>;
  // false si no existía (o era de otro analista).
  eliminar(id: string, analistaId: string): Promise<boolean>;
}
