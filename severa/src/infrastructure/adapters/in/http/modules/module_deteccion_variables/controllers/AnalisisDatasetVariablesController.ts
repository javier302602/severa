import express from 'express';
import { container } from '../../../../../../config/container';
import { responderErrorDeAnalisisDeDatos } from '../../../shared/responderErrorDeAnalisisDeDatos';
import { TIPOS_DE_COLUMNA_DETALLADOS, esTipoColumnaDetallado } from '../../../../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';

// M-14, Ronda 2: lo que el sistema DETECTA sobre las variables y lo que el
// analista puede corregirle. Tres piezas, todas sobre una sesión de análisis
// ya abierta y con analistaId siempre del token:
//   RF-108  ¿este dataset se puede tratar como serie de tiempo?
//   RF-110  variable objetivo: el sistema sugiere, el analista decide
//   RF-111  corrección manual del tipo de una variable
export const analisisDatasetVariablesRouter = express.Router();

// RF-108. Solo lectura.
analisisDatasetVariablesRouter.get('/analisis-datos/:sesionId/serie-de-tiempo', async (req, res) => {
  try {
    res.json(await container.evaluarSerieDeTiempoGenericoUseCase.ejecutar(req.analistaAutenticado!.id, req.params.sesionId));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// RF-110. Devuelve las candidatas que propone el sistema, la decisión vigente
// del analista (pendiente / rechazada / confirmada) y las columnas que se
// pueden elegir a mano.
analisisDatasetVariablesRouter.get('/analisis-datos/:sesionId/variable-objetivo', async (req, res) => {
  try {
    res.json(await container.sugerirVariableObjetivoUseCase.ejecutar(req.analistaAutenticado!.id, req.params.sesionId));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// RF-110: "el sistema no fija la variable objetivo sin confirmación del
// analista". Esta es la única ruta que la fija, y solo con lo que mande el
// analista:
//   { "columna": "aprobado" }  -> la confirma
//   { "columna": null }        -> rechaza las sugerencias (no hay objetivo)
// El campo es obligatorio: un body vacío no se interpreta como rechazo.
analisisDatasetVariablesRouter.put('/analisis-datos/:sesionId/variable-objetivo', async (req, res) => {
  const cuerpo: unknown = req.body;
  if (typeof cuerpo !== 'object' || cuerpo === null || !('columna' in cuerpo)) {
    res.status(400).json({ error: 'Debe indicar "columna": el nombre de la variable objetivo, o null para descartar las sugerencias' });
    return;
  }
  const { columna } = cuerpo as { columna: unknown };
  if (columna !== null && (typeof columna !== 'string' || columna.trim() === '')) {
    res.status(400).json({ error: 'El campo "columna" debe ser el nombre de una columna o null' });
    return;
  }

  try {
    res.json(await container.definirVariableObjetivoUseCase.ejecutar(req.analistaAutenticado!.id, req.params.sesionId, columna));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// RF-111: el analista corrige el tipo que el sistema detectó para una
// variable, y el cambio vale para todos los análisis posteriores.
//   { "columna": "Código postal", "tipo": "categorica_nominal" } -> lo fija
//   { "columna": "Código postal", "tipo": null }                 -> vuelve al automático
// PUT y no PATCH: el resultado es el mismo se llame una vez o diez.
analisisDatasetVariablesRouter.put('/analisis-datos/:sesionId/tipo-de-variable', async (req, res) => {
  const cuerpo: unknown = req.body;
  if (typeof cuerpo !== 'object' || cuerpo === null || !('tipo' in cuerpo)) {
    res.status(400).json({ error: 'Debe indicar "columna" y "tipo" (o "tipo": null para volver a la detección automática)' });
    return;
  }
  const { columna, tipo } = cuerpo as { columna?: unknown; tipo: unknown };
  if (typeof columna !== 'string' || columna.trim() === '') {
    res.status(400).json({ error: 'Debe indicar "columna"' });
    return;
  }
  if (tipo !== null && !esTipoColumnaDetallado(tipo)) {
    res.status(400).json({ error: `El campo "tipo" debe ser null o uno de: ${TIPOS_DE_COLUMNA_DETALLADOS.join(', ')}` });
    return;
  }

  try {
    res.json(await container.corregirTipoDeVariableUseCase.ejecutar(req.analistaAutenticado!.id, req.params.sesionId, columna, tipo));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});
