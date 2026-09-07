import { ObtenerHistorialAnalisis } from '../../../src/application/usecases/module_perfil_analista/ObtenerHistorialAnalisis';
import { RegistrarAnalisisRealizado } from '../../../src/application/usecases/module_perfil_analista/RegistrarAnalisisRealizado';
import { HistorialAnalisisRepository } from '../../../src/application/ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { AnalisisRealizado } from '../../../src/domain/entities/AnalisisRealizado';
import { Paginacion } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';

// Fake en memoria (no jest.fn) para poder sembrar datos reales a través del
// puerto de escritura y luego consultarlos a través del puerto de lectura,
// como pide el plan de RF-11 — no un mock que solo verifica llamadas.
function repositorioEnMemoria(): HistorialAnalisisRepository {
  const registros: AnalisisRealizado[] = [];
  return {
    async registrar(analisis: AnalisisRealizado): Promise<void> {
      registros.push(analisis);
    },
    async listarPorAnalista(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]> {
      const propios = registros
        .filter((registro) => registro.analistaId === analistaId)
        .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime());
      if (!paginacion) return propios;
      return propios.slice(paginacion.offset, paginacion.offset + paginacion.limite);
    }
  };
}

describe('Historial de Análisis (RF-11)', () => {
  test('un analista sin eventos registrados obtiene un historial vacío', async () => {
    const repository = repositorioEnMemoria();
    const obtenerHistorial = new ObtenerHistorialAnalisis(repository);

    const resultado = await obtenerHistorial.ejecutar('analista-nuevo');

    expect(resultado).toEqual([]);
  });

  test('registra eventos a través del puerto de escritura y los devuelve ordenados por fecha descendente', async () => {
    const repository = repositorioEnMemoria();
    const registrar = new RegistrarAnalisisRealizado(repository);
    const obtenerHistorial = new ObtenerHistorialAnalisis(repository);

    // Reloj controlado (mismo criterio que SesionAnalisisStoreEnMemoria.test.ts)
    // para que el orden de fechaHora entre ambos eventos sea determinista, sin
    // depender de que el reloj real avance entre las dos llamadas.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await registrar.ejecutar({ analistaId: 'analista-A', tipoEvento: 'InformeGenerado', payload: { formato: 'pdf' } });

    jest.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    await registrar.ejecutar({
      analistaId: 'analista-A',
      tipoEvento: 'AnalisisUnivariadoRealizado',
      payload: { columna: 'cvssScore' }
    });
    jest.useRealTimers();

    const historial = await obtenerHistorial.ejecutar('analista-A');

    expect(historial.map((evento) => evento.tipoEvento)).toEqual([
      'AnalisisUnivariadoRealizado',
      'InformeGenerado'
    ]);
  });

  test('scoping: un analista no ve el historial de otro', async () => {
    const repository = repositorioEnMemoria();
    const registrar = new RegistrarAnalisisRealizado(repository);
    const obtenerHistorial = new ObtenerHistorialAnalisis(repository);

    await registrar.ejecutar({ analistaId: 'analista-A', tipoEvento: 'InformeGenerado', payload: {} });
    await registrar.ejecutar({ analistaId: 'analista-B', tipoEvento: 'InformeGenerado', payload: {} });

    const historialDeA = await obtenerHistorial.ejecutar('analista-A');
    const historialDeB = await obtenerHistorial.ejecutar('analista-B');

    expect(historialDeA).toHaveLength(1);
    expect(historialDeA[0].analistaId).toBe('analista-A');
    expect(historialDeB).toHaveLength(1);
    expect(historialDeB[0].analistaId).toBe('analista-B');
  });
});
