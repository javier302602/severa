import { GenerarDistribucionFrecuencias } from '../../../src/application/usecases/module_distribucion_frecuencias/GenerarDistribucionFrecuencias';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { NumeroDeIntervalosInvalidoError } from '../../../src/domain/errors/NumeroDeIntervalosInvalidoError';
import { ValorEstadisticoError } from '../../../src/domain/errors/ValorEstadisticoError';

function repositorioFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

describe('GenerarDistribucionFrecuencias', () => {
  test('genera la tabla sin agrupar para un conjunto fijo de CVSS', async () => {
    const repo = repositorioFalso([
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No')),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'PostgreSQL', new TipoAccesoValue('No'))
    ]);

    const usecase = new GenerarDistribucionFrecuencias(repo);
    const resultado = await usecase.ejecutar('sinAgrupar', 'analista-1');

    expect(resultado).toEqual([
      { valor: 7.8, frecuencia: 2 },
      { valor: 9.8, frecuencia: 1 },
      { valor: 10, frecuencia: 1 }
    ]);
  });

  // RF-39: override manual, con las 5 bandas oficiales de CVSS como default
  // sin cambios (rango fijo 0-10, no min/max real de los scores).
  test('sin numeroDeIntervalos, la tabla agrupada mantiene las 5 bandas oficiales de siempre', async () => {
    const repo = repositorioFalso([
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.0), 'Apache Log4j')
    ]);

    const usecase = new GenerarDistribucionFrecuencias(repo);
    const resultado = (await usecase.ejecutar('agrupada', 'analista-1')) as Array<{ intervalo: string }>;

    expect(resultado.map((fila) => fila.intervalo)).toEqual(['[0-2)', '[2-4)', '[4-6)', '[6-8)', '[8-10)']);
  });

  test('con numeroDeIntervalos manual, reparte el rango fijo 0-10 en esa cantidad de bandas', async () => {
    const repo = repositorioFalso([
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.0), 'Apache Log4j')
    ]);

    const usecase = new GenerarDistribucionFrecuencias(repo);
    const resultado = (await usecase.ejecutar('agrupada', 'analista-1', undefined, 2)) as Array<{
      limiteInferior: number;
      limiteSuperior: number;
    }>;

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ limiteInferior: 0, limiteSuperior: 5 });
    expect(resultado[1]).toMatchObject({ limiteInferior: 5, limiteSuperior: 10 });
  });

  test.each([0, 1, -2, 31])('numeroDeIntervalos inválido (%i) tira NumeroDeIntervalosInvalidoError', async (numero) => {
    const repo = repositorioFalso([]);
    const usecase = new GenerarDistribucionFrecuencias(repo);

    await expect(usecase.ejecutar('agrupada', 'analista-1', undefined, numero)).rejects.toThrow(
      NumeroDeIntervalosInvalidoError
    );
  });

  test('numeroDeIntervalos se ignora para tipo=sinAgrupar (no aplica)', async () => {
    const repo = repositorioFalso([
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.0), 'Apache Log4j')
    ]);

    const usecase = new GenerarDistribucionFrecuencias(repo);
    await expect(usecase.ejecutar('sinAgrupar', 'analista-1', undefined, 0)).resolves.toEqual([{ valor: 9, frecuencia: 1 }]);
  });

  // M-05 (retoma, RF-33): variable='diasParaParche' generaliza de verdad —
  // a diferencia de cvssScore, no tiene un rango fijo de negocio, así que
  // usa el rango REAL de los datos (mismo criterio que
  // generarIntervalosAutomaticos() de AnalisisUnivariadoGenerico.ts).
  describe('variable="diasParaParche" (RF-33)', () => {
    function vulnerabilidadConDias(id: string, diasParaParche?: number): Vulnerabilidad {
      return new Vulnerabilidad(
        id,
        new IdentificadorCVE(`CVE-2024-0000${id}`),
        new CvssScore(5.0),
        'Software De Prueba',
        new TipoAccesoValue('Sí'),
        diasParaParche
      );
    }

    test('sin numeroDeIntervalos, calcula la cantidad automática (Sturges) sobre el rango REAL de los datos, no 0-10', async () => {
      const repo = repositorioFalso([vulnerabilidadConDias('1', 10), vulnerabilidadConDias('2', 20), vulnerabilidadConDias('3', 30)]);
      const usecase = new GenerarDistribucionFrecuencias(repo);

      const resultado = (await usecase.ejecutar('agrupada', 'analista-1', undefined, undefined, 'diasParaParche')) as Array<{
        limiteInferior: number;
        limiteSuperior: number;
      }>;

      // Sturges para n=3 -> 3 intervalos (acotado [3,10]); rango real 10-30, no 0-10.
      expect(resultado).toHaveLength(3);
      expect(resultado[0].limiteInferior).toBe(10);
      expect(resultado[resultado.length - 1].limiteSuperior).toBe(30);
    });

    test('con numeroDeIntervalos manual, reparte el rango REAL de los datos (no 0-10)', async () => {
      const repo = repositorioFalso([vulnerabilidadConDias('1', 10), vulnerabilidadConDias('2', 20), vulnerabilidadConDias('3', 30)]);
      const usecase = new GenerarDistribucionFrecuencias(repo);

      const resultado = (await usecase.ejecutar('agrupada', 'analista-1', undefined, 2, 'diasParaParche')) as Array<{
        limiteInferior: number;
        limiteSuperior: number;
      }>;

      expect(resultado).toEqual([
        expect.objectContaining({ limiteInferior: 10, limiteSuperior: 20 }),
        expect.objectContaining({ limiteInferior: 20, limiteSuperior: 30 })
      ]);
    });

    test('excluye vulnerabilidades sin diasParaParche cargado (no cuenta como 0 ni rompe)', async () => {
      const repo = repositorioFalso([vulnerabilidadConDias('1', 15), vulnerabilidadConDias('2', undefined)]);
      const usecase = new GenerarDistribucionFrecuencias(repo);

      const resultado = await usecase.ejecutar('sinAgrupar', 'analista-1', undefined, undefined, 'diasParaParche');

      expect(resultado).toEqual([{ valor: 15, frecuencia: 1 }]);
    });

    test('sin ninguna vulnerabilidad con diasParaParche cargado, tira ValorEstadisticoError con la etiqueta correcta (no un caso especial nuevo)', async () => {
      const repo = repositorioFalso([vulnerabilidadConDias('1', undefined)]);
      const usecase = new GenerarDistribucionFrecuencias(repo);

      await expect(usecase.ejecutar('agrupada', 'analista-1', undefined, undefined, 'diasParaParche')).rejects.toThrow(
        ValorEstadisticoError
      );
      await expect(usecase.ejecutar('agrupada', 'analista-1', undefined, undefined, 'diasParaParche')).rejects.toThrow(
        'La lista de Días para Parche no puede estar vacía'
      );
    });

    test('catálogo vacío con tipo=sinAgrupar también tira ValorEstadisticoError con la etiqueta correcta', async () => {
      const repo = repositorioFalso([]);
      const usecase = new GenerarDistribucionFrecuencias(repo);

      await expect(usecase.ejecutar('sinAgrupar', 'analista-1', undefined, undefined, 'diasParaParche')).rejects.toThrow(
        'La lista de Días para Parche no puede estar vacía'
      );
    });
  });
});
