import { GenerarGrafico } from '../../src/application/usecases/GenerarGrafico';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { GraficosOutputPort } from '../../src/application/ports/out/GraficosOutputPort';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function repoFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

function graficosOutputPortFalso(): jest.Mocked<GraficosOutputPort> {
  return {
    renderizarHistograma: jest.fn().mockResolvedValue('<svg>histograma</svg>'),
    renderizarBarras: jest.fn().mockResolvedValue('<svg>barras</svg>'),
    renderizarPastel: jest.fn().mockResolvedValue('<svg>pastel</svg>'),
    renderizarBoxplot: jest.fn().mockResolvedValue('<svg>boxplot</svg>'),
    renderizarDispersion: jest.fn().mockResolvedValue('<svg>dispersion</svg>'),
    renderizarBarrasHorizontales: jest.fn().mockResolvedValue('<svg>barrasH</svg>')
  };
}

const dataset = [
  new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
  new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(4.2), 'OpenSSL', new TipoAccesoValue('No'))
];

describe('GenerarGrafico — formato svg devuelve { svg, interpretacion }', () => {
  test('formato svg (por defecto): envuelve el resultado del adapter con la interpretación real', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('barrasSeveridad', 'analista-1');

    expect(resultado).toEqual({
      svg: '<svg>barras</svg>',
      interpretacion: expect.stringContaining('%')
    });
  });

  test('formato json: sigue siendo el passthrough {tipo, datos} tal cual devuelve el adapter (comportamiento preexistente)', async () => {
    const port = graficosOutputPortFalso();
    port.renderizarBarras.mockResolvedValue({ tipo: 'barras', datos: [] });
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('barrasSeveridad', 'analista-1', { formato: 'json' });

    expect(resultado).toEqual({ tipo: 'barras', datos: [] });
  });

  test('formato png: sigue devolviendo el string del adapter sin envolver (comportamiento preexistente)', async () => {
    const port = graficosOutputPortFalso();
    port.renderizarBarras.mockResolvedValue('<svg>pendiente PNG</svg>');
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('barrasSeveridad', 'analista-1', { formato: 'png' });

    expect(resultado).toBe('<svg>pendiente PNG</svg>');
  });

  test('boxplotCvss: la interpretación usa el resumen de cinco números real, no un valor fijo', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('boxplotCvss', 'analista-1');

    expect(resultado).toEqual({ svg: '<svg>boxplot</svg>', interpretacion: expect.stringContaining('10.0') });
  });

  test('dispersionCvssDias: sin diasParaParche en ninguna vulnerabilidad, la interpretación dice que no hay datos suficientes', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('dispersionCvssDias', 'analista-1');

    expect(resultado).toEqual({
      svg: '<svg>dispersion</svg>',
      interpretacion: expect.stringContaining('No hay suficientes')
    });
  });

  test('topSoftware: la interpretación nombra el software real más frecuente', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('topSoftware', 'analista-1');

    expect(resultado).toEqual({
      svg: '<svg>barrasH</svg>',
      interpretacion: expect.stringContaining('Apache Log4j')
    });
  });
});
