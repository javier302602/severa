import { ExportarHistorialAnalisisUseCase } from '../../ports/in/module_perfil_analista/ExportarHistorialAnalisisUseCase';
import { HistorialAnalisisRepository } from '../../ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { ExportadorDeTablaExcel } from '../../ports/out/exportacion/ExportadorDeTablaExcel';
import { nombreDeVersionDeDataset, presentarAnalisisRealizado } from '../../../domain/services/historial/HistorialDeAnalisis';

// Tope de filas del archivo. El historial anota cada tipo de análisis una
// vez por sesión o por día, así que llegar acá llevaría años de uso; el tope
// existe para que una exportación nunca pueda pedirle a la base una cantidad
// ilimitada de filas.
export const MAXIMO_DE_EVENTOS_EXPORTADOS = 50_000;

const ZONA_HORARIA_POR_DEFECTO = 'America/Lima';

export function encabezadosDelHistorialExportado(zonaHoraria: string): string[] {
  return [`Fecha (${zonaHoraria})`, 'Dataset', 'Versión', 'Tipo de análisis', 'Detalle'];
}

// Una celda de fecha de Excel no lleva zona horaria: muestra el reloj que se
// le escriba. Se le escribe el reloj de la zona configurada (la misma de los
// informes), y el encabezado dice cuál es; con la hora en UTC, un análisis
// hecho en Lima a las 9 de la mañana figuraba a las 14.
// Devuelve una fecha cuyos campos UTC son ese reloj local, que es como el
// exportador escribe las fechas. Si la zona está mal escrita en la
// configuración, null: se exporta en UTC y se dice.
function relojLocal(fecha: Date, zonaHoraria: string): Date | null {
  try {
    const partes = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zonaHoraria,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      })
        .formatToParts(fecha)
        .map((parte) => [parte.type, Number(parte.value)])
    );
    return new Date(Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second));
  } catch {
    return null;
  }
}

// RF-14: exporta el historial del analista a .xlsx con fecha, dataset y tipo
// de análisis realizado. Sale lo mismo que muestra la pantalla (misma
// presentación), del más reciente al más antiguo.
export class ExportarHistorialAnalisis implements ExportarHistorialAnalisisUseCase {
  constructor(
    private readonly historialAnalisisRepository: HistorialAnalisisRepository,
    private readonly exportadorDeTablaExcel: ExportadorDeTablaExcel,
    private readonly zonaHoraria: string = ZONA_HORARIA_POR_DEFECTO
  ) {}

  async ejecutar(analistaId: string): Promise<Buffer> {
    const eventos = await this.historialAnalisisRepository.listarPorAnalista(analistaId, { limite: MAXIMO_DE_EVENTOS_EXPORTADOS, offset: 0 });
    const zona = relojLocal(new Date(0), this.zonaHoraria) ? this.zonaHoraria : 'UTC';

    return this.exportadorDeTablaExcel.exportar({
      nombreDeHoja: 'Historial de análisis',
      encabezados: encabezadosDelHistorialExportado(zona),
      filas: eventos.map(presentarAnalisisRealizado).map((evento) => [
        relojLocal(evento.fechaHora, zona) ?? evento.fechaHora,
        evento.dataset,
        evento.version === null ? null : nombreDeVersionDeDataset(evento.version),
        evento.tipoDeAnalisis,
        evento.detalle
      ])
    });
  }
}
