import { GenerarInformeDataset } from '../../../src/application/usecases/module_reportes_exportacion/GenerarInformeDataset';
import { SesionAnalisisStore } from '../../../src/application/ports/out/dataset/SesionAnalisisStore';
import { GeneradorDeInformes, InformeSolicitado, FormatoDeInforme } from '../../../src/application/ports/out/reportes/GeneradorDeInformes';
import { AnalistaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AnalistaRepository';
import { Analista } from '../../../src/domain/entities/Analista';
import { Correo } from '../../../src/domain/shared/value-objects/Correo';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';

function analistaRepositoryFalso(): AnalistaRepository {
  const analista = new Analista('analista-A', 'Ana Torres', new Correo('ana@example.com'), 'hash', 'analista');
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    buscarPorId: jest.fn().mockResolvedValue(analista),
    eliminar: jest.fn().mockResolvedValue(undefined),
    actualizarUmbralCritico: jest.fn().mockResolvedValue(undefined),
    obtenerUmbralCritico: jest.fn().mockResolvedValue(null),
    listarTodos: jest.fn().mockResolvedValue([])
  };
}

function storeFalso(datos: ReturnType<SesionAnalisisStore['obtener']>): jest.Mocked<SesionAnalisisStore> {
  return {
    crear: jest.fn(),
    actualizarTiposCorregidos: jest.fn().mockReturnValue(true),
    obtener: jest.fn().mockReturnValue(datos)
  };
}

function geradorDeInformesFalso(): jest.Mocked<GeneradorDeInformes> {
  return {
    generarInformeEnFormato: jest.fn(async (_informe: InformeSolicitado, formato: FormatoDeInforme) => ({
      contenido: Buffer.from(`${formato}-falso`),
      tipoMime: `tipo/${formato}`,
      extension: formato
    })),
    generarResumenEjecutivo: jest.fn()
  };
}

describe('GenerarInformeDataset — Mejora 4 (Análisis de Datos General) Fase 5', () => {
  test('formato pdf: delega en el store, arma el DTO y pide el informe del pipeline genérico', async () => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso());

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', 'pdf');

    expect(store.obtener).toHaveBeenCalledWith('analista-A', 'sesion-1');
    expect(resultado.contenido.toString()).toBe('pdf-falso');
    expect(gerador.generarInformeEnFormato).toHaveBeenCalledTimes(1);

    const [informe, formato, opciones] = gerador.generarInformeEnFormato.mock.calls[0];
    expect(formato).toBe('pdf');
    expect(opciones).toEqual({});
    expect(informe.pipeline).toBe('generico');
    if (informe.pipeline === 'generico') expect(informe.datos.totalFilas).toBe(2);
  });

  test.each(['docx', 'html', 'latex', 'xlsx'] as const)('formato %s: pasa el formato pedido tal cual al generador', async (formato) => {
    const store = storeFalso({ columnas: ['precio'], filas: [{ precio: 10 }, { precio: 20 }] });
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso());

    const resultado = await useCase.ejecutar('analista-A', 'sesion-1', formato, { adjuntarGraficos: true });

    expect(resultado.extension).toBe(formato);
    expect(gerador.generarInformeEnFormato).toHaveBeenCalledWith(expect.objectContaining({ pipeline: 'generico' }), formato, { adjuntarGraficos: true });
  });

  test('si el store no encuentra la sesión, tira SesionAnalisisNoEncontradaError sin llamar al generador', async () => {
    const store = storeFalso(undefined);
    const gerador = geradorDeInformesFalso();
    const useCase = new GenerarInformeDataset(store, gerador, analistaRepositoryFalso());

    await expect(useCase.ejecutar('analista-A', 'sesion-de-otro', 'pdf')).rejects.toThrow(SesionAnalisisNoEncontradaError);
    expect(gerador.generarInformeEnFormato).not.toHaveBeenCalled();
  });
});
