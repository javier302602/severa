import { CriterioDeClasificacionJSON } from '../shared/value-objects/CriterioDeClasificacion';
import { TipoColumnaDetallado } from '../services/variable-detection/DetectorDeTipoDeColumna';
import { PlantillaDeAnalisisInvalidaError } from '../errors/PlantillaDeAnalisisErrors';

export const LARGO_MAXIMO_DEL_NOMBRE_DE_PLANTILLA = 80;

// Lo que guarda una plantilla: la configuración de análisis de un dataset del
// camino genérico. Solo lo que el analista decidió — nada de lo que el
// sistema detecta solo.
//   - tiposCorregidos: tipo fijado a mano por columna (RF-111).
//   - variableObjetivo: la columna que el analista confirmó (RF-110), o null.
//     Solo se guarda una decisión confirmada: "pendiente" no es una decisión,
//     y "rechazada" tampoco se lleva — una plantilla agrega o cambia, nunca
//     quita (ver PlanDeAplicacionDePlantilla).
//   - clasificacion: criterio de clasificación (RF-139) y la columna clave que
//     viaja con él, o null.
export interface ConfiguracionDePlantilla {
  tiposCorregidos: Record<string, TipoColumnaDetallado>;
  variableObjetivo: string | null;
  clasificacion: { criterio: CriterioDeClasificacionJSON; columnaClave: string | null } | null;
}

// RF-12 (M-02): "el analista puede guardar una plantilla con nombre. La
// plantilla puede reaplicarse sobre un nuevo dataset compatible".
export class PlantillaDeAnalisis {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly nombre: string,
    public readonly configuracion: ConfiguracionDePlantilla,
    public readonly fechaCreacion: Date = new Date()
  ) {}

  // El nombre tal como se guarda: sin espacios al borde, de 1 a 80
  // caracteres. La unicidad (sin distinguir mayúsculas) la garantiza el
  // repositorio.
  static normalizarNombre(nombre: string): string {
    const limpio = nombre.trim();
    if (limpio === '') {
      throw new PlantillaDeAnalisisInvalidaError('La plantilla necesita un nombre.');
    }
    // Se cuentan caracteres, no unidades UTF-16: igual que char_length() en
    // la restricción de la tabla.
    if ([...limpio].length > LARGO_MAXIMO_DEL_NOMBRE_DE_PLANTILLA) {
      throw new PlantillaDeAnalisisInvalidaError(
        `El nombre de la plantilla puede tener hasta ${LARGO_MAXIMO_DEL_NOMBRE_DE_PLANTILLA} caracteres.`
      );
    }
    return limpio;
  }

  // Clave con la que se comparan nombres: "Mi plantilla" y " mi PLANTILLA "
  // son el mismo nombre.
  static claveDeNombre(nombre: string): string {
    return nombre.trim().toLowerCase();
  }

  static estaVacia(configuracion: ConfiguracionDePlantilla): boolean {
    return (
      Object.keys(configuracion.tiposCorregidos).length === 0 &&
      configuracion.variableObjetivo === null &&
      configuracion.clasificacion === null
    );
  }

  // Las columnas que el dataset nuevo tiene que tener para ser "compatible".
  get columnasMencionadas(): string[] {
    return columnasMencionadasPor(this.configuracion);
  }
}

export function columnasMencionadasPor(configuracion: ConfiguracionDePlantilla): string[] {
  const { tiposCorregidos, variableObjetivo, clasificacion } = configuracion;
  const columnas = [
    ...Object.keys(tiposCorregidos),
    ...(variableObjetivo !== null ? [variableObjetivo] : []),
    ...(clasificacion ? [clasificacion.criterio.nombreColumna] : []),
    ...(clasificacion?.columnaClave ? [clasificacion.columnaClave] : [])
  ];
  return [...new Set(columnas)];
}
