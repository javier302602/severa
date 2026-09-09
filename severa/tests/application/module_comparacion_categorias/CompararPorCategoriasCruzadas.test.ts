import { CompararPorCategoriasCruzadas } from '../../../src/application/usecases/module_comparacion_categorias/CompararPorCategoriasCruzadas';
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

describe('CompararPorCategoriasCruzadas — M-08 (retoma, RF-65)', () => {
  test('sin variables explícitas, cruza tipoAcceso (default A) x estadoRemediacion (default B)', async () => {
    const usecase = new CompararPorCategoriasCruzadas(repositorioFalso(dataset));
    const resultado = await usecase.ejecutar('analista-1');

    // Ambas vulnerabilidades quedan en 'Pendiente' (default de la entidad) -> 2 celdas observadas.
    expect(resultado).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoriaA: 'Remoto', categoriaB: 'Pendiente', cantidad: 1 }),
        expect.objectContaining({ categoriaA: 'Local', categoriaB: 'Pendiente', cantidad: 1 })
      ])
    );
  });

  test('con variables explícitas (una abierta, una cerrada)', async () => {
    const usecase = new CompararPorCategoriasCruzadas(repositorioFalso(dataset));
    const resultado = await usecase.ejecutar('analista-1', 'software', 'tipoAcceso');

    expect(resultado).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoriaA: 'Apache Log4j', categoriaB: 'Remoto' }),
        expect.objectContaining({ categoriaA: 'Nginx', categoriaB: 'Local' })
      ])
    );
  });

  test('con variableValor="diasParaParche" explícito y válido', async () => {
    const conDias = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(9.5), 'A', new TipoAccesoValue('Sí'), 7)
    ];
    const usecase = new CompararPorCategoriasCruzadas(repositorioFalso(conDias));
    const resultado = (await usecase.ejecutar('analista-1', 'tipoAcceso', 'estadoRemediacion', 'diasParaParche')) as Array<{
      categoriaA: string;
      media: number | null;
    }>;

    expect(resultado.find((c) => c.categoriaA === 'Remoto')?.media).toBe(7);
  });

  test('variableAgrupacionA===variableAgrupacionB tira VariableDeConsultaInvalidaError', async () => {
    const usecase = new CompararPorCategoriasCruzadas(repositorioFalso(dataset));
    await expect(usecase.ejecutar('analista-1', 'tipoAcceso', 'tipoAcceso')).rejects.toThrow(VariableDeConsultaInvalidaError);
  });

  test('variableAgrupacionA inválida tira VariableDeConsultaInvalidaError', async () => {
    const usecase = new CompararPorCategoriasCruzadas(repositorioFalso(dataset));
    await expect(usecase.ejecutar('analista-1', 'noExiste', 'tipoAcceso')).rejects.toThrow(VariableDeConsultaInvalidaError);
  });

  test('variableValor inválida tira VariableDeConsultaInvalidaError', async () => {
    const usecase = new CompararPorCategoriasCruzadas(repositorioFalso(dataset));
    await expect(usecase.ejecutar('analista-1', 'tipoAcceso', 'estadoRemediacion', 'noExiste')).rejects.toThrow(
      VariableDeConsultaInvalidaError
    );
  });

  test('con una lista de vulnerabilidades ya cargada, no consulta el repositorio', async () => {
    const repo = repositorioFalso([]);
    const usecase = new CompararPorCategoriasCruzadas(repo);

    await usecase.ejecutar('analista-1', undefined, undefined, undefined, dataset);

    expect(repo.listar).not.toHaveBeenCalled();
  });
});
