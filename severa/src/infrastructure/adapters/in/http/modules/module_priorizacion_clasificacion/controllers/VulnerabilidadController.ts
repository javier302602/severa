import express from 'express';
import { container } from '../../../../../../config/container';
import {
  esVariableNumericaValida,
  esVariableCategoricaValida,
  obtenerValorNumerico,
  obtenerValorCategorico,
  VariableNumericaVulnerabilidad,
  VariableCategoricaVulnerabilidad
} from '../../../../../../../domain/services/classification/VariablesVulnerabilidad';
import { Vulnerabilidad } from '../../../../../../../domain/entities/Vulnerabilidad';
import { VariableDeConsultaInvalidaError } from '../../../../../../../domain/errors/VariableDeConsultaInvalidaError';

export const vulnerabilidadRouter = express.Router();

// M-04 (retoma, RF-27/RF-28): defaults fijos, para que ninguna URL/filtro
// favorito ya existente (M-11) que no mande `variable` cambie de
// comportamiento. Un valor de `variable` presente pero inválido (ni numérica
// ni categórica conocida) es un 400 explícito, no un fallback silencioso al
// default — evita que un typo en la URL devuelva resultados de otra variable
// sin que el analista se entere.
const VARIABLE_NUMERICA_POR_DEFECTO: VariableNumericaVulnerabilidad = 'cvssScore';
const VARIABLE_CATEGORICA_POR_DEFECTO: VariableCategoricaVulnerabilidad = 'severidad';

// RF-25/RF-30/RF-31 (M-04, retoma): la ficha sigue exponiendo cve/cvssScore/
// tipoAcceso/... literales (retrocompatibilidad — nada de lo que ya consume
// esta respuesta debe romperse), y AHORA suma `variableClasificacion`/
// `variableAgrupacion` como vista genérica sobre esos mismos datos —
// aditivo, mismo criterio que RF-112 (M-14): sumar, no reemplazar.
// `variableClasificacion` usa la variable NUMÉRICA por defecto (cvssScore) y
// `variableAgrupacion` la CATEGÓRICA por defecto (tipoAcceso, que es la que
// tiene sentido para "agrupación" — severidad ya es una clasificación, no
// una agrupación) porque el Modo B (criterio configurable por el analista,
// ver VariablesVulnerabilidad.ts) queda diferido: hoy no hay nada persistido
// que sustituya al default. RF-31 (fechas) no gana un campo nuevo acá —
// bloqueado por RF-20/NVD, ver VariableFechaVulnerabilidad.
//
// Bug real de Sprint 17: esta respuesta se armaba a mano y solo copiaba 5
// campos, olvidando estadoRemediacion/tipoVulnerabilidad/diasParaParche/
// fechaCarga/fechaRemediacion — ConsultarVulnerabilidadPorCVE ya devolvía la
// entidad completa (vía buscarPorCve -> mapRow), el dato se perdía acá, no
// antes. Ahora expone los mismos campos que el resto de los endpoints que
// devuelven vulnerabilidades (ver BusquedaController.ts), más los que solo
// tiene sentido mostrar en el detalle de una.
function armarFichaVulnerabilidad(vulnerabilidad: Vulnerabilidad) {
  const variableNumerica: VariableNumericaVulnerabilidad = 'cvssScore';
  const variableCategorica: VariableCategoricaVulnerabilidad = 'tipoAcceso';

  return {
    id: vulnerabilidad.id,
    cve: vulnerabilidad.cve.valor,
    software: vulnerabilidad.descripcion,
    cvssScore: vulnerabilidad.cvssScore.valor,
    tipoAcceso: vulnerabilidad.tipoAcceso?.valor ?? 'Local',
    tipoVulnerabilidad: vulnerabilidad.tipoVulnerabilidad,
    diasParaParche: vulnerabilidad.diasParaParche ?? null,
    estadoRemediacion: vulnerabilidad.estadoRemediacion.valor,
    fechaCarga: vulnerabilidad.fechaCarga,
    fechaRemediacion: vulnerabilidad.fechaRemediacion ?? null,
    variableClasificacion: { variable: variableNumerica, valor: obtenerValorNumerico(vulnerabilidad, variableNumerica) },
    variableAgrupacion: { variable: variableCategorica, valor: obtenerValorCategorico(vulnerabilidad, variableCategorica) }
  };
}

vulnerabilidadRouter.get('/:cve', async (req, res) => {
  const vulnerabilidad = await container.consultarVulnerabilidadPorCveUseCase.ejecutar(req.params.cve, req.analistaAutenticado!.id);
  if (!vulnerabilidad) {
    res.status(404).json({ error: 'Vulnerabilidad no encontrada' });
    return;
  }

  res.json(armarFichaVulnerabilidad(vulnerabilidad));
});

vulnerabilidadRouter.get('/', async (req, res) => {
  const cvssMin = req.query.cvssMin ? Number(req.query.cvssMin) : undefined;
  const cvssMax = req.query.cvssMax ? Number(req.query.cvssMax) : undefined;
  const severidad = typeof req.query.severidad === 'string' ? req.query.severidad : undefined;
  const variableQuery = typeof req.query.variable === 'string' ? req.query.variable : undefined;

  try {
    if (cvssMin !== undefined && cvssMax !== undefined) {
      const variable = variableQuery !== undefined ? validarVariableNumerica(variableQuery) : VARIABLE_NUMERICA_POR_DEFECTO;
      const resultados = await container.filtrarPorRangoDeVariableUseCase.ejecutar(cvssMin, cvssMax, req.analistaAutenticado!.id, variable);
      res.json(resultados.map((item) => ({ cve: item.cve.valor, cvssScore: item.cvssScore.valor, software: item.descripcion })));
      return;
    }

    if (severidad) {
      const variable = variableQuery !== undefined ? validarVariableCategorica(variableQuery) : VARIABLE_CATEGORICA_POR_DEFECTO;
      const resultados = await container.filtrarPorCategoriaClasificacionUseCase.ejecutar(severidad, req.analistaAutenticado!.id, variable);
      res.json(resultados.map((item) => ({ cve: item.cve.valor, cvssScore: item.cvssScore.valor, software: item.descripcion })));
      return;
    }

    res.json([]);
  } catch (error) {
    if (error instanceof VariableDeConsultaInvalidaError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

function validarVariableNumerica(variable: string): VariableNumericaVulnerabilidad {
  if (!esVariableNumericaValida(variable)) {
    throw new VariableDeConsultaInvalidaError(`"${variable}" no es una variable numérica válida (cvssScore, diasParaParche)`);
  }
  return variable;
}

function validarVariableCategorica(variable: string): VariableCategoricaVulnerabilidad {
  if (!esVariableCategoricaValida(variable)) {
    throw new VariableDeConsultaInvalidaError(`"${variable}" no es una variable categórica válida (tipoAcceso, estadoRemediacion, severidad)`);
  }
  return variable;
}
