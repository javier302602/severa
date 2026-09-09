import { Vulnerabilidad } from '../../entities/Vulnerabilidad';
import { CvssScore } from '../../shared/value-objects/CvssScore';
import { NivelDeRiesgo } from '../../shared/value-objects/NivelDeRiesgo';
import { clasificar } from './ClasificadorDeRiesgo';

// RF-27/RF-28 (M-04, retoma): a diferencia de CriterioDeClasificacionValue
// (M-09), que vive sobre RegistroDatasetGenerico — JSONB sin esquema, donde
// "la columna" es cualquier string que el analista haya escrito — acá el
// esquema de Vulnerabilidad es FIJO y conocido de antemano. No hace falta
// (ni conviene) un lookup dinámico por nombre de columna: alcanza con una
// unión de tipos acotada a las variables que YA EXISTEN en la entidad, más
// una función que sabe extraer el valor real de cada una. Decisión de
// arquitectura confirmada: NO migrar M-04 al pipeline genérico (eso queda
// reservado — ver DatasetGenerico.preset — para una unificación futura sin
// fecha); esto es un mecanismo paralelo, propio del esquema fijo de
// `vulnerabilidades`.
//
// Deliberadamente NO se reutiliza CriterioDeClasificacionValue en este
// archivo — esa pieza se reutiliza tal cual, sin cambios, en el caso de uso
// que consuma el Modo B (clasificación por umbrales configurables, diferido
// — ver comentario al final de este archivo). Acá solo vive la extracción
// de valores del Modo A (elegir variable existente, sin redefinir umbrales).
export type VariableNumericaVulnerabilidad = 'cvssScore' | 'diasParaParche';

export type VariableCategoricaVulnerabilidad = 'tipoAcceso' | 'estadoRemediacion' | 'severidad';

// RF-31: bloqueado por RF-20 (SEVERA no captura la fecha de publicación NVD
// — ver LIMITACIÓN CONOCIDA en FiltroVulnerabilidad.ts/MotorDePriorizacion.ts).
// Esta unión ya deja el punto de extensión listo: el día que exista una
// tercera fecha real (ej. 'fechaPublicacionNvd'), agregarla acá es el único
// cambio estructural necesario en el mecanismo — nada más se toca. Hoy no
// tiene ningún caso de uso que la consuma (RF-31 no cambia funcionalmente
// esta ronda), se deja declarada solo para dejar constancia del punto de
// extensión en el propio código, no como documentación suelta.
export type VariableFechaVulnerabilidad = 'fechaCarga' | 'fechaRemediacion';

export const VARIABLES_NUMERICAS_VULNERABILIDAD: VariableNumericaVulnerabilidad[] = ['cvssScore', 'diasParaParche'];

export const VARIABLES_CATEGORICAS_VULNERABILIDAD: VariableCategoricaVulnerabilidad[] = [
  'tipoAcceso',
  'estadoRemediacion',
  'severidad'
];

export function esVariableNumericaValida(valor: string): valor is VariableNumericaVulnerabilidad {
  return (VARIABLES_NUMERICAS_VULNERABILIDAD as string[]).includes(valor);
}

export function esVariableCategoricaValida(valor: string): valor is VariableCategoricaVulnerabilidad {
  return (VARIABLES_CATEGORICAS_VULNERABILIDAD as string[]).includes(valor);
}

// Nota: severidad NO tiene un "obtenerValorCategorico" desde este archivo
// para el caso EN MEMORIA (a diferencia de tipoAcceso/estadoRemediacion, que
// sí son campos directos de la entidad) — hoy Vulnerabilidad no trae
// `severidad` como campo propio, solo existe como columna denormalizada en
// la tabla `vulnerabilidades` (calculada una vez al insertar, ver
// PostgresVulnerabilidadRepository.calcularSeveridad). El Modo A filtra
// `severidad` siempre contra esa columna ya existente (recompute en vivo no
// aplica al default: no hay nada que recalcular, la columna YA es el
// default). Si en el futuro se activa el Modo B (criterio de clasificación
// configurable, reutilizando CriterioDeClasificacionValue.numerica() sobre
// 'cvssScore' u otra variable numérica) esa clasificación se computa en
// memoria a partir de VARIABLES_NUMERICAS_VULNERABILIDAD, nunca se vuelve a
// escribir en la columna `severidad` (ver decisión de la Capa 3, auditoría
// de retoma de M-04: no denormalizar un criterio personalizado, para no
// afectar a los ~16 consumidores existentes de esa columna).
export function obtenerValorNumerico(vulnerabilidad: Vulnerabilidad, variable: VariableNumericaVulnerabilidad): number | undefined {
  return variable === 'cvssScore' ? vulnerabilidad.cvssScore.valor : vulnerabilidad.diasParaParche;
}

// RF-69: mismas etiquetas (en femenino) que ya usaba
// PostgresVulnerabilidadRepository.calcularSeveridad() al insertar — se
// centraliza acá para que el envelope en memoria de RF-25/RF-30 (una
// Vulnerabilidad ya traída, sin volver a golpear la base) y el cálculo al
// escribir la columna `severidad` (Modo A, caso default) usen la MISMA
// función en vez de mantener el mapa de etiquetas duplicado en dos lugares.
// Es el default fijo de siempre (CVSS, RF-69) — el Modo B (criterio de
// clasificación configurable) es lo único que en el futuro podría devolver
// una etiqueta distinta para el mismo cvssScore, y ese modo queda diferido.
const ETIQUETAS_SEVERIDAD_POR_DEFECTO: Record<NivelDeRiesgo, string> = {
  Bajo: 'Baja',
  Moderado: 'Media',
  Alto: 'Alta',
  Crítico: 'Crítica'
};

export function obtenerSeveridadPorDefecto(cvssScore: CvssScore): string {
  return ETIQUETAS_SEVERIDAD_POR_DEFECTO[clasificar(cvssScore).valor];
}

// tipoAcceso/estadoRemediacion son campos directos de la entidad; severidad
// no lo es (ver nota más arriba) y se resuelve con obtenerSeveridadPorDefecto
// a partir de cvssScore — mismo valor que ya tiene la columna denormalizada
// para cualquier Vulnerabilidad que no haya configurado un criterio propio
// (Modo B, diferido).
export function obtenerValorCategorico(vulnerabilidad: Vulnerabilidad, variable: VariableCategoricaVulnerabilidad): string {
  if (variable === 'tipoAcceso') return vulnerabilidad.tipoAcceso?.valor ?? 'Local';
  if (variable === 'estadoRemediacion') return vulnerabilidad.estadoRemediacion.valor;
  return obtenerSeveridadPorDefecto(vulnerabilidad.cvssScore);
}
