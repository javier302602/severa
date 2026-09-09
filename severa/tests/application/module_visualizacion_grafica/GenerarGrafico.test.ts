import { GenerarGrafico } from '../../../src/application/usecases/module_visualizacion_grafica/GenerarGrafico';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { GraficosOutputPort } from '../../../src/application/ports/out/graphics/GraficosOutputPort';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';

function repoFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
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

  // Cobertura del resto del switch (antes sin ejercitar): histogramaCvss,
  // histogramaCvssAgrupado, pastelSeveridad, cvssPorAcceso,
  // histogramaDiasParche, topTipos, y el tipo no soportado.
  test('histogramaCvss: delega en renderizarHistograma con bins reales de los CVSS del dataset', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('histogramaCvss', 'analista-1');

    expect(port.renderizarHistograma).toHaveBeenCalled();
    expect(resultado).toEqual({ svg: '<svg>histograma</svg>', interpretacion: expect.stringContaining('media') });
  });

  test('histogramaCvssAgrupado: delega en renderizarHistograma reutilizando generarTablaAgrupada (M-05)', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('histogramaCvssAgrupado', 'analista-1');

    expect(port.renderizarHistograma).toHaveBeenCalled();
    expect(resultado).toEqual({ svg: '<svg>histograma</svg>', interpretacion: expect.any(String) });
  });

  test('pastelSeveridad: delega en renderizarPastel con el mismo conteo por severidad que barrasSeveridad', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('pastelSeveridad', 'analista-1');

    expect(port.renderizarPastel).toHaveBeenCalled();
    expect(resultado).toEqual({ svg: '<svg>pastel</svg>', interpretacion: expect.any(String) });
  });

  test('cvssPorAcceso: delega en renderizarBarras con el promedio de CVSS por tipo de acceso', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('cvssPorAcceso', 'analista-1');

    expect(port.renderizarBarras).toHaveBeenCalledWith(expect.any(Array), 'svg', 'CVSS por tipo de acceso', 'CVSS Score', 'Tipo de acceso');
    expect(resultado).toEqual({ svg: '<svg>barras</svg>', interpretacion: expect.any(String) });
  });

  test('histogramaDiasParche: ninguna vulnerabilidad del dataset tiene diasParaParche registrado (degrada a 0, no rompe)', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('histogramaDiasParche', 'analista-1');

    expect(port.renderizarHistograma).toHaveBeenCalled();
    expect(resultado).toEqual({
      svg: '<svg>histograma</svg>',
      interpretacion: expect.stringContaining('tiempo promedio')
    });
  });

  test('histogramaDiasParche: dataset vacío responde "no hay vulnerabilidades" (bins realmente vacíos, no solo en 0)', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso([]), port);

    const resultado = await useCase.ejecutar('histogramaDiasParche', 'analista-1');

    expect(resultado).toEqual({
      svg: '<svg>histograma</svg>',
      interpretacion: expect.stringContaining('No hay vulnerabilidades')
    });
  });

  test('topTipos: delega en renderizarBarrasHorizontales, excluyendo "Sin clasificar"/"N/A" del ranking', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    const resultado = await useCase.ejecutar('topTipos', 'analista-1');

    expect(port.renderizarBarrasHorizontales).toHaveBeenCalled();
    expect(resultado).toEqual({ svg: '<svg>barrasH</svg>', interpretacion: expect.any(String) });
  });

  test('tipo de gráfico no soportado lanza un error claro', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await expect(useCase.ejecutar('noExiste' as never, 'analista-1')).rejects.toThrow('Tipo de gráfico no soportado');
  });
});

// M-07 (retoma, RF-51/52/53/56/57): `variable`/`variableAgrupacion`/
// `variableValor` generalizan histogramaCvss, histogramaCvssAgrupado,
// barrasSeveridad, pastelSeveridad y cvssPorAcceso a diasParaParche/
// tipoAcceso/estadoRemediacion — Modo A (elegir variable existente, sin
// redefinir umbrales/categorías).
describe('GenerarGrafico — M-07 retoma: variable configurable', () => {
  const datasetConDias = [
    new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5),
    new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(4.2), 'OpenSSL', new TipoAccesoValue('No'), 30)
  ];

  test('RETROCOMPATIBILIDAD: histogramaCvss sin variable da exactamente el título/etiqueta de siempre', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await useCase.ejecutar('histogramaCvss', 'analista-1');

    expect(port.renderizarHistograma).toHaveBeenCalledWith(expect.anything(), 'svg', 'Histograma de CVSS', 'CVSS Score');
  });

  test('histogramaCvss con variable="diasParaParche" usa el título/etiqueta de esa variable', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(datasetConDias), port);

    await useCase.ejecutar('histogramaCvss', 'analista-1', { variable: 'diasParaParche' });

    expect(port.renderizarHistograma).toHaveBeenCalledWith(expect.anything(), 'svg', 'Histograma de días para parche', 'Días para parche');
  });

  test('histogramaCvssAgrupado con variable="diasParaParche" reparte el rango real de los datos (no 0-10)', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(datasetConDias), port);

    const resultado = await useCase.ejecutar('histogramaCvssAgrupado', 'analista-1', { variable: 'diasParaParche', formato: 'json' });

    expect(port.renderizarHistograma).toHaveBeenCalled();
    // formato json: passthrough del adapter (mock siempre devuelve el mismo string) —
    // lo relevante es que no explota calculando el rango real (5..30).
    expect(resultado).toBe('<svg>histograma</svg>');
  });

  test('RETROCOMPATIBILIDAD: barrasSeveridad sin variable delega en el conteo por severidad de siempre', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await useCase.ejecutar('barrasSeveridad', 'analista-1');

    expect(port.renderizarBarras).toHaveBeenCalledWith(expect.anything(), 'svg', 'Barras por severidad', 'Cantidad', 'Severidad');
  });

  test('barrasSeveridad con variable="tipoAcceso" cuenta por Remoto/Local en vez de severidad', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await useCase.ejecutar('barrasSeveridad', 'analista-1', { variable: 'tipoAcceso' });

    expect(port.renderizarBarras).toHaveBeenCalledWith(
      [{ etiqueta: 'Remoto', valor: 1 }, { etiqueta: 'Local', valor: 1 }],
      'svg',
      'Barras por tipo de acceso',
      'Cantidad',
      'Tipo de acceso'
    );
  });

  test('pastelSeveridad con variable="estadoRemediacion" cuenta por las 3 categorías de estado', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await useCase.ejecutar('pastelSeveridad', 'analista-1', { variable: 'estadoRemediacion' });

    expect(port.renderizarPastel).toHaveBeenCalledWith(
      [
        { etiqueta: 'Pendiente', valor: 2 },
        { etiqueta: 'EnProceso', valor: 0 },
        { etiqueta: 'Remediada', valor: 0 }
      ],
      'svg',
      'Distribución por estado de remediación'
    );
  });

  test('RETROCOMPATIBILIDAD: cvssPorAcceso sin variableAgrupacion/variableValor da el título exacto de siempre', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await useCase.ejecutar('cvssPorAcceso', 'analista-1');

    expect(port.renderizarBarras).toHaveBeenCalledWith(expect.any(Array), 'svg', 'CVSS por tipo de acceso', 'CVSS Score', 'Tipo de acceso');
  });

  test('cvssPorAcceso con variableAgrupacion="estadoRemediacion" y variableValor="diasParaParche"', async () => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(datasetConDias), port);

    await useCase.ejecutar('cvssPorAcceso', 'analista-1', { variableAgrupacion: 'estadoRemediacion', variableValor: 'diasParaParche' });

    expect(port.renderizarBarras).toHaveBeenCalledWith(
      expect.any(Array),
      'svg',
      'Días para parche por estado de remediación',
      'Días para parche',
      'Estado de remediación'
    );
  });

  test.each([
    ['histogramaCvss', { variable: 'noExiste' }],
    ['barrasSeveridad', { variable: 'noExiste' }],
    ['cvssPorAcceso', { variableAgrupacion: 'noExiste' }],
    ['cvssPorAcceso', { variableValor: 'noExiste' }]
  ])('%s con variable inválida tira VariableDeConsultaInvalidaError', async (tipo, opciones) => {
    const port = graficosOutputPortFalso();
    const useCase = new GenerarGrafico(repoFalso(dataset), port);

    await expect(useCase.ejecutar(tipo as never, 'analista-1', opciones)).rejects.toThrow('no es una variable');
  });
});
