import { Vulnerabilidad } from '../../entities/Vulnerabilidad';
import { calcularMedia, calcularDesviacionEstandarMuestral } from '../descriptive-statistics/EstadisticaDescriptiva';
import { VariableDeConsultaInvalidaError } from '../../errors/VariableDeConsultaInvalidaError';
import {
  VariableCategoricaVulnerabilidad,
  VariableNumericaVulnerabilidad,
  esVariableCategoricaValida,
  obtenerValorCategorico,
  obtenerValorNumerico
} from '../classification/VariablesVulnerabilidad';

// M-08 (retoma, RF-62/63/64/65/67). Archivo NUEVO y separado de
// ComparadorDeCategorias.ts a propósito: compararGrupos()/ComparacionGrupos
// (RF-68, binario, 2 grupos con campos nombrados A/B) quedan intactos —
// siguen siendo lo que usan CompararPorTipoAcceso/CompararPorTipoDeVulnerabilidad/
// CompararPorSoftware y RecopilarDatosDeInforme.ts (M-10). Esto es un motor
// aparte, para N grupos, que ningún código existente conocía ni necesitaba.
//
// Decisión de arquitectura confirmada (auditoría de retoma de M-08):
// VariableCategoricaVulnerabilidad (M-04/M-07: tipoAcceso | estadoRemediacion
// | severidad) es un conjunto CERRADO y conocido de antemano — sirve tal
// cual, sin tocarlo. Pero tipoVulnerabilidad/software (las dos variables que
// ya usaban CompararPorTipoDeVulnerabilidad/CompararPorSoftware) son texto
// ABIERTO: cualquier valor que traiga el dataset importado, sin lista fija
// conocible de antemano — mismo motivo por el que existe
// listarSoftwareDisponible() (VulnerabilidadRepository). Necesitan su propio
// tipo, con su propio criterio para saber qué categorías existen (se
// descubren de los datos reales, no de una lista fija).
export type VariableCategoricaAbiertaVulnerabilidad = 'tipoVulnerabilidad' | 'software';

export function esVariableCategoricaAbiertaValida(valor: string): valor is VariableCategoricaAbiertaVulnerabilidad {
  return valor === 'tipoVulnerabilidad' || valor === 'software';
}

function obtenerValorCategoricoAbierto(vulnerabilidad: Vulnerabilidad, variable: VariableCategoricaAbiertaVulnerabilidad): string {
  return variable === 'tipoVulnerabilidad' ? vulnerabilidad.tipoVulnerabilidad : vulnerabilidad.software;
}

// Unión discriminada: el ÚNICO lugar del código que distingue "cerrada" de
// "abierta". Todo lo demás en este archivo (y los casos de uso que lo
// consuman) recibe/pasa este tipo tal cual, sin un if por cada call site —
// esa es la razón de ser de esta unión, no una preferencia estética.
export type VariableAgrupacionVulnerabilidad =
  | { tipo: 'cerrada'; variable: VariableCategoricaVulnerabilidad }
  | { tipo: 'abierta'; variable: VariableCategoricaAbiertaVulnerabilidad };

function obtenerClaveDeAgrupacion(vulnerabilidad: Vulnerabilidad, variable: VariableAgrupacionVulnerabilidad): string {
  return variable.tipo === 'cerrada'
    ? obtenerValorCategorico(vulnerabilidad, variable.variable)
    : obtenerValorCategoricoAbierto(vulnerabilidad, variable.variable);
}

// Duplicación deliberada (auditoría de retoma de M-08, confirmada): mismas 3
// listas que CATEGORIAS_POR_VARIABLE en GraficosEstadisticos.ts (M-07), que
// queda sin tocar. Son constantes literales de 2 a 4 strings cada una, no
// una fórmula — el riesgo real de que diverjan es prácticamente nulo, y
// evita acoplar el dominio de "comparación" (M-08) al de "gráficos" (M-07),
// que son conceptualmente aparte aunque lean la misma entidad.
const CATEGORIAS_POR_VARIABLE_CERRADA: Record<VariableCategoricaVulnerabilidad, string[]> = {
  severidad: ['Baja', 'Media', 'Alta', 'Crítica'],
  tipoAcceso: ['Remoto', 'Local'],
  estadoRemediacion: ['Pendiente', 'EnProceso', 'Remediada']
};

// Cerrada: siempre las categorías conocidas de antemano (con o sin datos,
// mismo criterio que contarPorCategoria en M-07 — una categoría sin
// vulnerabilidades igual aparece, con cantidad 0). Abierta: se descubren los
// valores reales presentes en la muestra — nunca una lista inventada, y
// nunca una categoría "vacía" (si no aparece en los datos, no existe).
function obtenerCategoriasDeAgrupacion(vulnerabilidades: Vulnerabilidad[], variable: VariableAgrupacionVulnerabilidad): string[] {
  if (variable.tipo === 'cerrada') {
    return CATEGORIAS_POR_VARIABLE_CERRADA[variable.variable];
  }
  return [...new Set(vulnerabilidades.map((v) => obtenerValorCategoricoAbierto(v, variable.variable)))].sort();
}

export function resolverVariableAgrupacion(valor: string): VariableAgrupacionVulnerabilidad {
  if (esVariableCategoricaValida(valor)) return { tipo: 'cerrada', variable: valor };
  if (esVariableCategoricaAbiertaValida(valor)) return { tipo: 'abierta', variable: valor };
  throw new VariableDeConsultaInvalidaError(
    `"${valor}" no es una variable de agrupación válida (tipoAcceso, estadoRemediacion, severidad, tipoVulnerabilidad, software)`
  );
}

// Dos variables de agrupación son "la misma" si coinciden tipo+variable —
// usado para rechazar el cruce degenerado en compararPorCategoriasCruzadas.
function mismaVariableDeAgrupacion(a: VariableAgrupacionVulnerabilidad, b: VariableAgrupacionVulnerabilidad): boolean {
  return a.tipo === b.tipo && a.variable === b.variable;
}

// RF-62/63/64/67: media, desviación estándar y cantidad de registros por
// categoría — para CUALQUIER cantidad de categorías (a diferencia de
// compararGrupos, que asume exactamente 2). `cantidad` es el total de
// vulnerabilidades en la categoría, no la cantidad de valores numéricos
// válidos: una vulnerabilidad sin diasParaParche sigue contando para RF-67
// ("cantidad de registros por categoría"), aunque no aporte a media/sd.
export interface EstadisticoPorCategoria {
  categoria: string;
  media: number | null;
  desviacionEstandar: number | null;
  cantidad: number;
}

export function compararPorCategorias(
  vulnerabilidades: Vulnerabilidad[],
  variableAgrupacion: VariableAgrupacionVulnerabilidad,
  variableValor: VariableNumericaVulnerabilidad = 'cvssScore'
): EstadisticoPorCategoria[] {
  const categorias = obtenerCategoriasDeAgrupacion(vulnerabilidades, variableAgrupacion);

  return categorias.map((categoria) => {
    const delGrupo = vulnerabilidades.filter((v) => obtenerClaveDeAgrupacion(v, variableAgrupacion) === categoria);
    const valores = delGrupo.map((v) => obtenerValorNumerico(v, variableValor)).filter((v): v is number => v !== undefined);

    return {
      categoria,
      media: valores.length > 0 ? calcularMedia(valores) : null,
      desviacionEstandar: valores.length >= 2 ? calcularDesviacionEstandarMuestral(valores) : null,
      cantidad: delGrupo.length
    };
  });
}

// RF-65: cross-tab de DOS variables de agrupación simultáneas — pieza
// completamente nueva (confirmado en la auditoría: no existía nada parecido
// en ningún módulo). Cubre las 3 combinaciones (cerrada×cerrada,
// cerrada×abierta, abierta×abierta) por igual, sin código especial para
// ninguna — es la ventaja directa de que obtenerClaveDeAgrupacion ya
// resuelve "cerrada vs. abierta" en un solo lugar.
//
// Decisión confirmada: solo se emiten celdas OBSERVADAS (con al menos un
// registro real) — nunca un producto cartesiano completo. Es el mismo
// comportamiento que tendría un GROUP BY de dos columnas, y evita que
// cruzar dos variables abiertas (ej. tipoVulnerabilidad × software) explote
// en cientos de celdas vacías sin valor informativo.
export interface CeldaComparacionCruzada {
  categoriaA: string;
  categoriaB: string;
  media: number | null;
  desviacionEstandar: number | null;
  cantidad: number;
}

export function compararPorCategoriasCruzadas(
  vulnerabilidades: Vulnerabilidad[],
  variableAgrupacionA: VariableAgrupacionVulnerabilidad,
  variableAgrupacionB: VariableAgrupacionVulnerabilidad,
  variableValor: VariableNumericaVulnerabilidad = 'cvssScore'
): CeldaComparacionCruzada[] {
  if (mismaVariableDeAgrupacion(variableAgrupacionA, variableAgrupacionB)) {
    throw new VariableDeConsultaInvalidaError('variableAgrupacionA y variableAgrupacionB no pueden ser la misma variable');
  }

  const grupos = new Map<string, Vulnerabilidad[]>();
  vulnerabilidades.forEach((v) => {
    const categoriaA = obtenerClaveDeAgrupacion(v, variableAgrupacionA);
    const categoriaB = obtenerClaveDeAgrupacion(v, variableAgrupacionB);
    const clave = JSON.stringify([categoriaA, categoriaB]);
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.push(v);
    } else {
      grupos.set(clave, [v]);
    }
  });

  return [...grupos.entries()]
    .map(([clave, grupo]) => {
      const [categoriaA, categoriaB] = JSON.parse(clave) as [string, string];
      const valores = grupo.map((v) => obtenerValorNumerico(v, variableValor)).filter((v): v is number => v !== undefined);
      return {
        categoriaA,
        categoriaB,
        media: valores.length > 0 ? calcularMedia(valores) : null,
        desviacionEstandar: valores.length >= 2 ? calcularDesviacionEstandarMuestral(valores) : null,
        cantidad: grupo.length
      };
    })
    .sort((a, b) => a.categoriaA.localeCompare(b.categoriaA) || a.categoriaB.localeCompare(b.categoriaB));
}
