import { GenerarInformeDatasetConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/GenerarInformeDatasetConAuditoria';
import { GenerarInformeDatasetUseCase } from '../../../../src/application/ports/in/module_reportes_exportacion/GenerarInformeDatasetUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { ServicioDeNotificaciones } from '../../../../src/application/ports/out/notificaciones/ServicioDeNotificaciones';
import { AplicarLimpiezaDeDataset } from '../../../../src/application/usecases/module_limpieza_calidad_datos/AplicarLimpiezaDeDataset';
import { SesionAnalisisStoreEnMemoria } from '../../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { SesionAnalisisNoEncontradaError } from '../../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../../dobles/DatasetGenericoRepositoryEnMemoria';
import { historialFalso } from '../../../dobles/HistorialAnalisisRepositoryEnMemoria';

// RF-95 (auditar cada informe generado), RF-101 (avisar que está listo) y
// RF-11 (historial del analista), para el informe de un dataset genérico.
const ARCHIVO = { contenido: Buffer.from('pdf-falso'), tipoMime: 'application/pdf', extension: 'pdf' };
const COLUMNAS = { edad: [20, 25, 30, 35, null, 22], ciudad: ['Lima', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima'] };

async function preparar(usecase: GenerarInformeDatasetUseCase = { ejecutar: jest.fn().mockResolvedValue(ARCHIVO) }) {
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { nombreArchivo: 'encuesta.csv', columnas: COLUMNAS });
  const auditoria: jest.Mocked<AuditoriaRepository> = { registrar: jest.fn().mockResolvedValue(undefined), listar: jest.fn().mockResolvedValue([]) };
  const notificaciones = { notificarInformeListo: jest.fn().mockResolvedValue(undefined) };
  const historial = historialFalso();
  return {
    repositorio,
    store,
    auditoria,
    notificaciones,
    historial,
    usecase,
    ...cargado,
    informe: new GenerarInformeDatasetConAuditoria(usecase, auditoria, notificaciones as unknown as ServicioDeNotificaciones, historial, store, repositorio)
  };
}

describe('GenerarInformeDatasetConAuditoria', () => {
  test('audita el informe con su dataset, lo anota en el historial y avisa que está listo', async () => {
    const { informe, usecase, auditoria, notificaciones, historial, sesionId, datasetId } = await preparar();

    const archivo = await informe.ejecutar('analista-A', sesionId, 'pdf');

    expect(archivo).toBe(ARCHIVO);
    expect(usecase.ejecutar).toHaveBeenCalledWith('analista-A', sesionId, 'pdf', {});
    expect(auditoria.registrar).toHaveBeenCalledWith({
      usuario: 'analista-A',
      accion: 'GenerarInformeDataset',
      detalle: 'Informe completo de "encuesta.csv" (original) (pdf)',
      datasetId
    });
    expect(historial.deSesion).toHaveBeenCalledWith('analista-A', sesionId, 'InformeDeDataset', { cadaVez: true, detalle: 'Formato PDF' });
    expect(notificaciones.notificarInformeListo).toHaveBeenCalledWith('analista-A', 'pdf');
  });

  test('el informe de una versión procesada dice qué versión fue y se audita contra el dataset original', async () => {
    const { informe, auditoria, store, repositorio, sesionId, datasetId } = await preparar();
    const limpieza = await new AplicarLimpiezaDeDataset(store, repositorio).ejecutar(
      'analista-A',
      sesionId,
      [{ columna: 'edad', estrategia: 'imputar', metodo: 'media' }],
      true
    );

    await informe.ejecutar('analista-A', limpieza.sesionId, 'docx', { adjuntarGraficos: true });

    expect(auditoria.registrar).toHaveBeenCalledWith({
      usuario: 'analista-A',
      accion: 'GenerarInformeDataset',
      detalle: 'Informe completo de "encuesta.csv" (versión 1) (docx, con gráficos adjuntos)',
      datasetId
    });
  });

  test('una sesión sin dataset guardado igual se audita, sin dataset', async () => {
    const { informe, auditoria, store } = await preparar();
    const suelta = store.crear('analista-A', { columnas: ['x'], filas: [{ x: 1 }] });

    await informe.ejecutar('analista-A', suelta, 'html');

    expect(auditoria.registrar).toHaveBeenCalledWith({
      usuario: 'analista-A',
      accion: 'GenerarInformeDataset',
      detalle: 'Informe completo (html)',
      datasetId: null
    });
  });

  test('si generar el informe falla, no se audita, no se anota y no se notifica', async () => {
    const fallo = new SesionAnalisisNoEncontradaError();
    const { informe, auditoria, notificaciones, historial } = await preparar({ ejecutar: jest.fn().mockRejectedValue(fallo) });

    await expect(informe.ejecutar('analista-A', 'no-existe', 'pdf')).rejects.toBe(fallo);

    expect(auditoria.registrar).not.toHaveBeenCalled();
    expect(historial.deSesion).not.toHaveBeenCalled();
    expect(notificaciones.notificarInformeListo).not.toHaveBeenCalled();
  });
});
