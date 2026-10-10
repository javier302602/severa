import { BuscarConFiltros } from '../../../src/application/usecases/module_busqueda_filtros_avanzados/BuscarConFiltros';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { FiltroVulnerabilidad } from '../../../src/domain/shared/value-objects/FiltroVulnerabilidad';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { EscalaDeClasificacionRepositoryEnMemoria } from '../../dobles/EscalaDeClasificacionRepositoryEnMemoria';

// Dataset realista (mismo usado en otros tests del módulo de comparación):
// dos entradas con CVSS >= 9.0 (Crítico con CVSS), pero solo una es "Apache
// Log4j"; y una de 8.7, que es Alto con CVSS y Crítico con "Crítico desde 8.5".
const dataset = [
  new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
  new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE'),
  new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-08700'), new CvssScore(8.7), 'Router', new TipoAccesoValue('Sí'), undefined, 'Router', 'RCE'),
  new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), undefined, 'Microsoft Windows', 'EoP')
];

// Fake que replica la combinación AND de criterios que hace buscarConFiltros
// en Postgres (mismo comportamiento observable, incluido que el nivel se
// resuelve con la escala recibida), para validar RF-88 a nivel de aplicación
// sin levantar una base de datos real. Que el SQL real haga lo mismo lo
// comprueba BordesDeEscalaDeClasificacion.integration.test.ts.
function repositorioFalso(): jest.Mocked<VulnerabilidadRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(dataset),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    filtrarPorNivelDeRiesgo: jest.fn().mockResolvedValue([]),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockImplementation(async (filtro: FiltroVulnerabilidad, _analistaId: string, escala: EscalaDeClasificacion) =>
      dataset.filter((item) => {
        if (filtro.cve && item.cve.valor !== filtro.cve.valor) return false;
        if (filtro.cvssMin !== undefined && item.cvssScore.valor < filtro.cvssMin) return false;
        if (filtro.cvssMax !== undefined && item.cvssScore.valor > filtro.cvssMax) return false;
        if (filtro.nivelDeRiesgo && escala.clasificar(item.cvssScore.valor) !== filtro.nivelDeRiesgo) return false;
        if (filtro.componente && item.software !== filtro.componente) return false;
        return true;
      })
    ),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

function preparar() {
  const repository = repositorioFalso();
  const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
  return { repository, escalas, usecase: new BuscarConFiltros(repository, escalas) };
}

const cves = (resultado: { vulnerabilidades: Array<{ vulnerabilidad: Vulnerabilidad }> }) =>
  resultado.vulnerabilidades.map(({ vulnerabilidad }) => vulnerabilidad.cve.valor);

describe('BuscarConFiltros', () => {
  test('combina cvssMin=9.0 + nivel Crítico + software "Apache Log4j" y devuelve solo la coincidencia exacta', async () => {
    const { repository, usecase } = preparar();
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0, severidad: 'Crítico', componente: 'Apache Log4j' });

    const resultado = await usecase.ejecutar(filtro, 'analista-1');

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1', EscalaDeClasificacion.CVSS, undefined);
    expect(cves(resultado)).toEqual(['CVE-2021-44228']);
  });

  test('cada resultado viene con su nivel según la escala vigente, y la respuesta dice cuál es', async () => {
    const { usecase } = preparar();

    const resultado = await usecase.ejecutar(new FiltroVulnerabilidad({ cvssMin: 7.0 }), 'analista-1');

    expect(resultado.escala.personalizada).toBe(false);
    expect(resultado.vulnerabilidades.map(({ nivelDeRiesgo }) => nivelDeRiesgo)).toEqual(['Crítico', 'Crítico', 'Alto', 'Alto']);
  });

  test('RF-28: con "Crítico desde 8.5", el 8.7 pasa de Alto a Crítico en el filtro y en su nivel', async () => {
    const { repository, escalas, usecase } = preparar();
    const propia = EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 });

    const conCvss = await usecase.ejecutar(new FiltroVulnerabilidad({ severidad: 'Crítico' }), 'analista-1');
    await escalas.guardar('analista-1', propia);
    const conPropia = await usecase.ejecutar(new FiltroVulnerabilidad({ severidad: 'Crítico' }), 'analista-1');

    expect(cves(conCvss)).toEqual(['CVE-2021-44228', 'CVE-2021-35587']);
    expect(cves(conPropia)).toEqual(['CVE-2021-44228', 'CVE-2021-35587', 'CVE-2021-08700']);
    expect(conPropia.vulnerabilidades[2].nivelDeRiesgo).toBe('Crítico');
    expect(conPropia.escala).toEqual({ escala: propia, personalizada: true });
    expect(repository.buscarConFiltros).toHaveBeenLastCalledWith(expect.anything(), 'analista-1', propia, undefined);
  });

  test('un nombre viejo ("Crítica") filtra igual que el nuevo', async () => {
    const { usecase } = preparar();

    const resultado = await usecase.ejecutar(new FiltroVulnerabilidad({ severidad: 'Crítica' }), 'analista-1');

    expect(cves(resultado)).toEqual(['CVE-2021-44228', 'CVE-2021-35587']);
  });

  test('la escala de otro analista no afecta la búsqueda de este', async () => {
    const { escalas, usecase } = preparar();
    await escalas.guardar('analista-2', EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 }));

    const resultado = await usecase.ejecutar(new FiltroVulnerabilidad({ severidad: 'Crítico' }), 'analista-1');

    expect(cves(resultado)).toEqual(['CVE-2021-44228', 'CVE-2021-35587']);
  });

  test('agregar el filtro de componente sobre el mismo cvssMin reduce el resultado (efecto real de combinar filtros)', async () => {
    const { usecase } = preparar();

    const soloCvss = await usecase.ejecutar(new FiltroVulnerabilidad({ cvssMin: 9.0 }), 'analista-1');
    const combinado = await usecase.ejecutar(new FiltroVulnerabilidad({ cvssMin: 9.0, componente: 'OpenSSL' }), 'analista-1');

    expect(soloCvss.vulnerabilidades).toHaveLength(2);
    expect(cves(combinado)).toEqual(['CVE-2021-35587']);
  });

  // Paginación (2026-07-19): el usecase solo reenvía lo que le pasan, la
  // página real la arma BusquedaController y el LIMIT/OFFSET los aplica
  // PostgresVulnerabilidadRepository (ver test de integración para eso).
  test('reenvía la paginación tal cual al repositorio cuando se la pasan', async () => {
    const { repository, usecase } = preparar();
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0 });

    await usecase.ejecutar(filtro, 'analista-1', { limite: 200, offset: 400 });

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1', EscalaDeClasificacion.CVSS, { limite: 200, offset: 400 });
  });
});
