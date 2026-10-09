import express from 'express';
import { container } from '../../../../../../config/container';
import { responderErrorDeAnalisisDeDatos } from '../../../shared/responderErrorDeAnalisisDeDatos';
import { PlantillaDeAnalisis } from '../../../../../../../domain/entities/PlantillaDeAnalisis';

// RF-12 (M-02): plantillas de análisis del camino genérico. El analista sale
// siempre del token; las plantillas de otro responden 404, igual que las que
// no existen.
//   GET    /plantillas-analisis                                       las del analista
//   POST   /analisis-datos/:sesionId/plantillas                       guarda la config. del dataset abierto
//   DELETE /plantillas-analisis/:plantillaId                          la elimina
//   GET    /analisis-datos/:sesionId/plantillas/:plantillaId/vista-previa   qué cambiaría (no guarda nada)
//   POST   /analisis-datos/:sesionId/plantillas/:plantillaId/aplicar        aplica, exige "confirmado": true y la huella
export const plantillasDeAnalisisRouter = express.Router();

function aRespuesta(plantilla: PlantillaDeAnalisis) {
  return {
    id: plantilla.id,
    nombre: plantilla.nombre,
    fechaCreacion: plantilla.fechaCreacion.toISOString(),
    configuracion: plantilla.configuracion,
    columnas: plantilla.columnasMencionadas
  };
}

plantillasDeAnalisisRouter.get('/plantillas-analisis', async (req, res) => {
  try {
    const plantillas = await container.listarPlantillasDeAnalisisUseCase.ejecutar(req.analistaAutenticado!.id);
    res.json(plantillas.map(aRespuesta));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

plantillasDeAnalisisRouter.post('/analisis-datos/:sesionId/plantillas', async (req, res) => {
  const { nombre } = (req.body ?? {}) as { nombre?: unknown };
  if (typeof nombre !== 'string') {
    res.status(400).json({ error: 'Debe indicar "nombre": cómo se va a llamar la plantilla' });
    return;
  }

  try {
    const plantilla = await container.guardarPlantillaDeAnalisisUseCase.ejecutar(req.analistaAutenticado!.id, req.params.sesionId, nombre);
    res.status(201).json(aRespuesta(plantilla));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

plantillasDeAnalisisRouter.delete('/plantillas-analisis/:plantillaId', async (req, res) => {
  try {
    await container.eliminarPlantillaDeAnalisisUseCase.ejecutar(req.analistaAutenticado!.id, req.params.plantillaId);
    res.status(204).end();
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

plantillasDeAnalisisRouter.get('/analisis-datos/:sesionId/plantillas/:plantillaId/vista-previa', async (req, res) => {
  try {
    res.json(
      await container.aplicarPlantillaDeAnalisisUseCase.previsualizar(req.analistaAutenticado!.id, req.params.sesionId, req.params.plantillaId)
    );
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// "confirmado" tiene que ser exactamente el booleano true (mismo criterio que
// la limpieza, RF-120), y "huella" la que devolvió la vista previa que el
// analista vio: así nunca se aplica algo distinto de lo que confirmó.
plantillasDeAnalisisRouter.post('/analisis-datos/:sesionId/plantillas/:plantillaId/aplicar', async (req, res) => {
  const cuerpo = (req.body ?? {}) as { huella?: unknown; confirmado?: unknown };
  if (typeof cuerpo.huella !== 'string' || cuerpo.huella === '') {
    res.status(400).json({ error: 'Debe indicar "huella": la que devolvió la vista previa' });
    return;
  }

  try {
    res.json(
      await container.aplicarPlantillaDeAnalisisUseCase.ejecutar(
        req.analistaAutenticado!.id,
        req.params.sesionId,
        req.params.plantillaId,
        cuerpo.huella,
        cuerpo.confirmado === true
      )
    );
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});
