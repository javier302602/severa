import { CompararPorCategoria } from '../../../src/application/usecases/module_comparacion_categorias/CompararPorCategoria';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { VariableDeConsultaInvalidaError } from '../../../src/domain/errors/VariableDeConsultaInvalidaError';

function repositorioFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    listarPorSoftware: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

const dataset = [
  new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.5), 'Apache Log4j', new TipoAccesoValue('Sí')),
  new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(2.0), 'Nginx', new TipoAccesoValue('No'))
];

describe('CompararPorCategoria — M-08 (retoma, RF-62/63/64/67)', () => {
  test('sin variables explícitas, agrupa por tipoAcceso (default) usando cvssScore (default)', async () => {
    const usecase = new CompararPorCategoria(repositorioFalso(dataset));
    const resultado = await usecase.ejecutar('analista-1');

    expect(resultado).toEqual([
      { categoria: 'Remoto', media: 9.5, desviacionEstandar: null, cantidad: 1 },
      { categoria: 'Local', media: 2.0, desviacionEstandar: null, cantidad: 1 }
    ]);
  });

  test('con variableAgrupacion="software" (abierta), descubre las categorías reales', async () => {
    const usecase = new CompararPorCategoria(repositorioFalso(dataset));
    const resultado = await usecase.ejecutar('analista-1', 'software');

    expect(resultado).toEqual([
      { categoria: 'Apache Log4j', media: 9.5, desviacionEstandar: null, cantidad: 1 },
      { categoria: 'Nginx', media: 2.0, desviacionEstandar: null, cantidad: 1 }
    ]);
  });

  test('con variableValor="diasParaParche" explícito', async () => {
    const conDias = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.5), 'A', new TipoAccesoValue('Sí'), 10)
    ];
    const usecase = new CompararPorCategoria(repositorioFalso(conDias));
    const resultado = (await usecase.ejecutar('analista-1', 'tipoAcceso', 'diasParaParche')) as Array<{ categoria: string; media: number | null }>;

    expect(resultado.find((r) => r.categoria === 'Remoto')?.media).toBe(10);
  });

  test('variableAgrupacion inválida tira VariableDeConsultaInvalidaError', async () => {
    const usecase = new CompararPorCategoria(repositorioFalso(dataset));
    await expect(usecase.ejecutar('analista-1', 'noExiste')).rejects.toThrow(VariableDeConsultaInvalidaError);
  });

  test('variableValor inválida tira VariableDeConsultaInvalidaError', async () => {
    const usecase = new CompararPorCategoria(repositorioFalso(dataset));
    await expect(usecase.ejecutar('analista-1', 'tipoAcceso', 'noExiste')).rejects.toThrow(VariableDeConsultaInvalidaError);
  });

  test('con una lista de vulnerabilidades ya cargada, no consulta el repositorio', async () => {
    const repo = repositorioFalso([]);
    const usecase = new CompararPorCategoria(repo);

    await usecase.ejecutar('analista-1', undefined, undefined, dataset);

    expect(repo.listar).not.toHaveBeenCalled();
  });
});
