// RF-12 (M-02): errores de las plantillas de análisis. Todos los mensajes
// están escritos para el analista: el controlador los muestra tal cual.

// No existe para ESTE analista: una plantilla ajena responde igual que una
// inexistente (mismo criterio IDOR que DatasetGenericoNoEncontradoError).
export class PlantillaDeAnalisisNoEncontradaError extends Error {
  constructor(message = 'La plantilla de análisis no existe.') {
    super(message);
    this.name = 'PlantillaDeAnalisisNoEncontradaError';
  }
}

// Nombre vacío o demasiado largo, o un dataset sin nada que guardar.
export class PlantillaDeAnalisisInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlantillaDeAnalisisInvalidaError';
  }
}

// El analista ya tiene una plantilla con ese nombre (sin distinguir
// mayúsculas ni espacios al borde). No se sobrescribe.
export class NombreDePlantillaRepetidoError extends Error {
  constructor(nombre: string) {
    super(`Ya tenés una plantilla con el nombre "${nombre}" (sin distinguir mayúsculas). Elegí otro nombre o eliminá la anterior.`);
    this.name = 'NombreDePlantillaRepetidoError';
  }
}

// La plantilla no se puede aplicar a este dataset: le faltan columnas o algo
// de lo que trae no es válido con estos datos. No se aplicó nada.
export class PlantillaIncompatibleError extends Error {
  constructor(
    public readonly columnasFaltantes: string[],
    public readonly problemas: string[]
  ) {
    const partes: string[] = [];
    if (columnasFaltantes.length > 0) {
      partes.push(`al dataset le faltan las columnas ${columnasFaltantes.map((columna) => `"${columna}"`).join(', ')}`);
    }
    partes.push(...problemas);
    super(`La plantilla no se puede aplicar a este dataset: ${partes.join('; ')}. No se aplicó ningún cambio.`);
    this.name = 'PlantillaIncompatibleError';
  }
}

// Lo que se iba a aplicar ya no es lo que el analista vio en la vista previa
// (otro cambio entró en el medio, o una aplicación anterior quedó a medias).
// Se le pide volver a revisar antes de confirmar.
export class VistaPreviaDePlantillaDesactualizadaError extends Error {
  constructor(
    message = 'Los cambios pendientes ya no son los que viste en la vista previa. Volvé a revisarlos antes de confirmar.'
  ) {
    super(message);
    this.name = 'VistaPreviaDePlantillaDesactualizadaError';
  }
}

// RF-12 + RF-110/RF-120: aplicar exige la confirmación explícita del analista.
export class AplicacionDePlantillaSinConfirmarError extends Error {
  constructor(message = 'Para aplicar la plantilla tenés que confirmar los cambios de la vista previa.') {
    super(message);
    this.name = 'AplicacionDePlantillaSinConfirmarError';
  }
}
