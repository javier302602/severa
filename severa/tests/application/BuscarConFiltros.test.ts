import { BuscarConFiltros } from '../../src/application/usecases/BuscarConFiltros';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { FiltroVulnerabilidad } from '../../src/domain/value-objects/FiltroVulnerabilidad';

// Dataset realista (mismo usado en otros tests del módulo de comparación):
// dos entradas con CVSS >= 9.0 (Crítica), pero solo una es "Apache Log4j".
const dataset = [
  new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
  new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE'),
  new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), undefined, 'Microsoft Windows', 'EoP')
];

function severidadDe(vulnerabilidad: Vulnerabilidad): string {
  const cvss = vulnerabilidad.cvssScore.valor;
  if (cvss >= 9.0) return 'Crítica';
  if (cvss >= 7.0) return 'Alta';
  if (cvss >= 4.0) return 'Media';
  return 'Baja';
}

// Fake que replica la combinación AND de criterios que hace buscarConFiltros
// en Postgres (mismo comportamiento observable), para validar RF-88 a nivel
// de aplicación sin levantar una base de datos real.
function repositorioFalso(): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(dataset),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockImplementation(async (filtro: FiltroVulnerabilidad) =>
      dataset.filter((item) => {
        if (filtro.cve && item.cve.valor !== filtro.cve.valor) return false;
        if (filtro.cvssMin !== undefined && item.cvssScore.valor < filtro.cvssMin) return false;
        if (filtro.cvssMax !== undefined && item.cvssScore.valor > filtro.cvssMax) return false;
        if (filtro.severidad && severidadDe(item) !== filtro.severidad) return false;
        if (filtro.componente && item.software !== filtro.componente) return false;
        return true;
      })
    ),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

describe('BuscarConFiltros', () => {
  test('combina cvssMin=9.0 + severidad Crítica + software "Apache Log4j" y devuelve solo la coincidencia exacta', async () => {
    const repository = repositorioFalso();
    const usecase = new BuscarConFiltros(repository);
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0, severidad: 'Crítica', componente: 'Apache Log4j' });

    const resultado = await usecase.ejecutar(filtro, 'analista-1');

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1', undefined);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].cve.valor).toBe('CVE-2021-44228');
  });

  test('cvssMin=9.0 sin más filtros devuelve las dos vulnerabilidades críticas del dataset', async () => {
    const repository = repositorioFalso();
    const usecase = new BuscarConFiltros(repository);
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0 });

    const resultado = await usecase.ejecutar(filtro, 'analista-1');

    expect(resultado.map((item) => item.cve.valor).sort()).toEqual(['CVE-2021-35587', 'CVE-2021-44228']);
  });

  test('agregar el filtro de componente sobre el mismo cvssMin reduce el resultado (efecto real de combinar filtros)', async () => {
    const repository = repositorioFalso();
    const usecase = new BuscarConFiltros(repository);

    const soloCvss = await usecase.ejecutar(new FiltroVulnerabilidad({ cvssMin: 9.0 }), 'analista-1');
    const combinado = await usecase.ejecutar(new FiltroVulnerabilidad({ cvssMin: 9.0, componente: 'OpenSSL' }), 'analista-1');

    expect(soloCvss).toHaveLength(2);
    expect(combinado).toHaveLength(1);
    expect(combinado[0].cve.valor).toBe('CVE-2021-35587');
  });

  // Paginación (2026-07-19): el usecase solo reenvía lo que le pasan, la
  // página real la arma BusquedaController y el LIMIT/OFFSET los aplica
  // PostgresVulnerabilidadRepository (ver test de integración para eso).
  test('reenvía la paginación tal cual al repositorio cuando se la pasan', async () => {
    const repository = repositorioFalso();
    const usecase = new BuscarConFiltros(repository);
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0 });

    await usecase.ejecutar(filtro, 'analista-1', { limite: 200, offset: 400 });

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1', { limite: 200, offset: 400 });
  });
});
