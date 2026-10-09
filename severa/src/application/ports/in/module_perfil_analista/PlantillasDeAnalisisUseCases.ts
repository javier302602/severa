import { PlantillaDeAnalisis } from '../../../../domain/entities/PlantillaDeAnalisis';
import { CambioDePlantilla, PlanDeAplicacionDePlantilla } from '../../../../domain/services/plantillas/PlanDeAplicacionDePlantilla';
import { CorreccionesDeTipo } from '../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { DiagnosticoDataset } from '../../../../domain/services/data-cleaning/CalidadDeDatosGenerico';

// RF-12 (M-02): plantillas de análisis del camino genérico.

export interface GuardarPlantillaDeAnalisisUseCase {
  // Guarda con ese nombre la configuración actual del dataset de la sesión.
  ejecutar(analistaId: string, sesionId: string, nombre: string): Promise<PlantillaDeAnalisis>;
}

export interface ListarPlantillasDeAnalisisUseCase {
  ejecutar(analistaId: string): Promise<PlantillaDeAnalisis[]>;
}

export interface EliminarPlantillaDeAnalisisUseCase {
  // Lanza PlantillaDeAnalisisNoEncontradaError si no existe para ese analista.
  ejecutar(analistaId: string, plantillaId: string): Promise<void>;
}

interface DatosDeLaAplicacion {
  plantilla: { id: string; nombre: string };
  datasetOriginalId: string;
  nombreArchivo: string;
  version: number;
}

export interface VistaPreviaDePlantilla extends DatosDeLaAplicacion {
  plan: PlanDeAplicacionDePlantilla;
  // Identifica exactamente los cambios mostrados. Aplicar exige la misma
  // huella: si entre la vista previa y la confirmación cambió algo, no se
  // aplica nada distinto de lo que el analista vio.
  huella: string;
}

export interface ResultadoDeAplicacionDePlantilla extends DatosDeLaAplicacion {
  cambiosAplicados: CambioDePlantilla[];
  // Lo necesario para refrescar la pantalla sin otra consulta.
  tiposCorregidos: CorreccionesDeTipo;
  diagnostico: DiagnosticoDataset;
}

export interface AplicarPlantillaDeAnalisisUseCase {
  previsualizar(analistaId: string, sesionId: string, plantillaId: string): Promise<VistaPreviaDePlantilla>;
  // Aplica lo pendiente, en orden: tipos, variable objetivo, criterio. Es
  // repetible: si una aplicación anterior se cortó, la siguiente completa lo
  // que faltó.
  ejecutar(analistaId: string, sesionId: string, plantillaId: string, huella: string, confirmado: boolean): Promise<ResultadoDeAplicacionDePlantilla>;
}
