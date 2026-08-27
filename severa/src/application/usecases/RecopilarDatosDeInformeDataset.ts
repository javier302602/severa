import { DatosInformeDataset, AnexoMuestraFilasDataset } from '../ports/out/GeneradorDeInformes';
import { analizarDataset } from '../../domain/services/CalidadDeDatosGenerico';
import { calcularEstadisticasDescriptivas } from '../../domain/services/EstadisticasDescriptivasGenerico';
import { analizarColumnaUnivariado } from '../../domain/services/AnalisisUnivariadoGenerico';
import { calcularMatrizCorrelacion } from '../../domain/services/CorrelacionGenerico';
import { detectarOutliers } from '../../domain/services/DeteccionOutliersGenerico';
import { generarInterpretacionDataset } from '../../domain/services/InterpretadorDeResultadosGenerico';

// Mejora 4 (Análisis de Datos General) — Fase 5. Mismo rol que
// recopilarDatosDeInforme.ts: orquesta los servicios de dominio YA
// existentes de las Fases 2-4 de este módulo (nada se recalcula con lógica
// nueva acá) y arma el DTO que consume GeneradorDeInformes. Recibe columnas
// y filas ya leídas del sesionAnalisisStore — no sabe nada del store ni de
// IDOR, eso es responsabilidad de GenerarInformeDataset.ts.
const LIMITACIONES_CONOCIDAS_DATASET: string[] = [
  'La detección de tipo de columna (numérica/categórica/fecha/texto) es una heurística basada en mayoría (ver DetectorDeTipoDeColumna.ts) — no una declaración de esquema, así que columnas ambiguas pueden clasificarse de forma distinta a la esperada.',
  'El análisis univariado numérico agrupa cada columna en intervalos calculados automáticamente (regla de Sturges, acotada entre 3 y 10 intervalos) — no son los mismos intervalos que usaría un analista eligiéndolos a mano para esa variable en particular.',
  'La matriz de correlación usa eliminación por pares: cada celda se calcula solo con las filas donde ambas columnas tienen un valor numérico válido, así que columnas con muchos valores faltantes en distintas filas pueden correlacionar sobre una base de datos más chica que el total del dataset.',
  'Este informe se genera a partir de la sesión efímera creada al subir el archivo (ver SesionAnalisisStoreEnMemoria.ts) — si esa sesión expiró (30 minutos de inactividad) hay que volver a subir el archivo.'
];

// Anexo A ("Muestra de filas") del informe de dataset genérico: a diferencia
// del Anexo A de vulnerabilidades (columnas fijas conocidas de antemano), acá
// el número de columnas es arbitrario — se acota a las primeras 8 para que la
// tabla siga entrando en el ancho de una página A4, y a las primeras 20 filas
// para mantener el anexo corto (el propósito es ilustrar la forma real de los
// datos, no repetir el dataset completo — que además podría contener
// columnas de texto libre demasiado largas para una tabla).
const LIMITE_COLUMNAS_ANEXO = 8;
const LIMITE_FILAS_ANEXO = 20;

export function recopilarDatosDeInformeDataset(
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  generadoPara: string
): DatosInformeDataset {
  const diagnostico = analizarDataset(columnas, filas);
  const estadisticasDescriptivas = calcularEstadisticasDescriptivas(columnas, filas);

  const columnasNumericas = diagnostico.columnas.filter((columna) => columna.tipo === 'numerica').map((columna) => columna.nombre);
  const analisisUnivariado = columnasNumericas.map((nombre) => analizarColumnaUnivariado(nombre, columnas, filas));

  const matrizCorrelacion = calcularMatrizCorrelacion(columnas, filas);
  const outliers = detectarOutliers(columnas, filas);
  const interpretacion = generarInterpretacionDataset(diagnostico, matrizCorrelacion, outliers);

  const columnasMostradas = columnas.slice(0, LIMITE_COLUMNAS_ANEXO);
  const anexoMuestraFilas: AnexoMuestraFilasDataset = {
    columnasMostradas,
    totalColumnas: columnas.length,
    filas: filas.slice(0, LIMITE_FILAS_ANEXO),
    totalFilas: diagnostico.totalFilas
  };

  return {
    generadoEn: new Date(),
    generadoPara,
    totalFilas: diagnostico.totalFilas,
    totalColumnas: columnas.length,
    filasDuplicadas: diagnostico.filasDuplicadas,
    columnas: diagnostico.columnas,
    estadisticasDescriptivas,
    analisisUnivariado,
    matrizCorrelacion,
    outliers,
    interpretacion,
    limitacionesConocidas: LIMITACIONES_CONOCIDAS_DATASET,
    anexoMuestraFilas
  };
}
