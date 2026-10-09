import { GenerarInformeDatasetUseCase } from '../../../ports/in/module_reportes_exportacion/GenerarInformeDatasetUseCase';
import { ArchivoGenerado, FormatoDeInforme, OpcionesDeInforme } from '../../../ports/out/reportes/GeneradorDeInformes';
import { AuditoriaRepository } from '../../../ports/out/persistencia/repositorios/AuditoriaRepository';
import { DatasetGenericoRepository } from '../../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { ServicioDeNotificaciones } from '../../../ports/out/notificaciones/ServicioDeNotificaciones';
import { SesionAnalisisStore } from '../../../ports/out/dataset/SesionAnalisisStore';
import { RegistrarEnHistorialDeAnalisisUseCase } from '../../../ports/in/module_perfil_analista/RegistrarEnHistorialDeAnalisisUseCase';

// RF-95 / RF-101 / RF-11 para el informe de un dataset genérico: hasta acá
// solo el informe del catálogo de vulnerabilidades quedaba auditado,
// notificado y en el historial (GenerarInformeConAuditoria). Mismo trato para
// este: fecha, autor y tipo en la auditoría (con el dataset, RF-138), aviso
// de que está listo y entrada en el historial del analista.
export class GenerarInformeDatasetConAuditoria implements GenerarInformeDatasetUseCase {
  constructor(
    private readonly usecase: GenerarInformeDatasetUseCase,
    private readonly auditoriaRepository: AuditoriaRepository,
    private readonly servicioDeNotificaciones: ServicioDeNotificaciones,
    private readonly historial: RegistrarEnHistorialDeAnalisisUseCase,
    private readonly sesionAnalisisStore: SesionAnalisisStore,
    private readonly datasetGenericoRepository: DatasetGenericoRepository
  ) {}

  async ejecutar(analistaId: string, sesionId: string, formato: FormatoDeInforme, opciones: OpcionesDeInforme = {}): Promise<ArchivoGenerado> {
    const archivo = await this.usecase.ejecutar(analistaId, sesionId, formato, opciones);

    const datasetId = this.sesionAnalisisStore.obtener(analistaId, sesionId)?.datasetId;
    const dataset = datasetId ? await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId) : null;
    const sobre = dataset
      ? ` de "${dataset.nombreArchivo}" (${dataset.version === 0 ? 'original' : `versión ${dataset.version}`})`
      : '';

    await this.auditoriaRepository.registrar({
      usuario: analistaId,
      accion: 'GenerarInformeDataset',
      detalle: `Informe completo${sobre} (${formato}${opciones.adjuntarGraficos ? ', con gráficos adjuntos' : ''})`,
      datasetId: dataset?.idDelOriginal ?? null
    });

    await this.historial.deSesion(analistaId, sesionId, 'InformeDeDataset', { cadaVez: true, detalle: `Formato ${formato.toUpperCase()}` });
    await this.servicioDeNotificaciones.notificarInformeListo(analistaId, formato);

    return archivo;
  }
}
