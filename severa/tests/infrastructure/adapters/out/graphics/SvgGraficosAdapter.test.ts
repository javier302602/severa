import { SvgGraficosAdapter } from '../../../../../src/infrastructure/adapters/out/graphics/SvgGraficosAdapter';
import sharp from 'sharp';

// Bug real encontrado en vivo (auditoría de cierre de Mejora 4): GET
// /graficos/:tipo devolvía SIEMPRE el mismo SVG placeholder — un rectángulo
// blanco con el título nomás — sin importar los datos reales calculados por
// GenerarGrafico.ts. Confirmado pidiendo el gráfico real contra un dataset
// importado: la respuesta nunca cambiaba con los datos. Este test falla
// contra esa versión (dos datasets distintos producían el mismo SVG) y pasa
// una vez que el adapter dibuja de verdad con GeometriaDeGraficos.ts, la
// misma capa de geometría que ya usa GeneradorInformePDF.ts para el PDF.
describe('SvgGraficosAdapter — dibuja de verdad, no un placeholder fijo', () => {
  const adapter = new SvgGraficosAdapter();

  test('renderizarHistograma: el SVG cambia según los bins recibidos y contiene una barra por bin con frecuencia > 0', async () => {
    const datosA = { bins: [{ intervalo: '0-2', frecuencia: 3 }], media: 1, mediana: 1 };
    const datosB = {
      bins: [
        { intervalo: '0-2', frecuencia: 3 },
        { intervalo: '2-4', frecuencia: 9 },
        { intervalo: '4-6', frecuencia: 0 }
      ],
      media: 2.5,
      mediana: 2
    };

    const svgA = (await adapter.renderizarHistograma(datosA, 'svg')) as string;
    const svgB = (await adapter.renderizarHistograma(datosB, 'svg')) as string;

    expect(svgA).not.toBe(svgB);
    expect(svgB).toContain('<rect');
    // 2 barras con frecuencia > 0 (la de frecuencia 0 no debería dibujar una
    // barra de altura negativa ni romper el SVG).
    expect((svgB.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('renderizarBarras: una barra por elemento de datos, con la etiqueta real como texto', async () => {
    const datos = [
      { etiqueta: 'Crítica', valor: 5 },
      { etiqueta: 'Alta', valor: 2 }
    ];

    const svg = (await adapter.renderizarBarras(datos, 'svg')) as string;

    expect(svg).toContain('Crítica');
    expect(svg).toContain('Alta');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('renderizarBarrasHorizontales: una barra por elemento, con las etiquetas reales (ej. nombres de software)', async () => {
    const datos = [
      { etiqueta: 'Apache Log4j', valor: 12 },
      { etiqueta: 'OpenSSL', valor: 7 }
    ];

    const svg = (await adapter.renderizarBarrasHorizontales(datos, 'svg')) as string;

    expect(svg).toContain('Apache Log4j');
    expect(svg).toContain('OpenSSL');
  });

  // Bug real reportado con capturas en modo oscuro: el nombre de cada barra
  // (y la leyenda del pastel, más abajo) SÍ estaba en el SVG, pero dibujado
  // con el mismo color hex (#1e293b) que dark:bg-slate-800 — el fondo de la
  // tarjeta en modo oscuro — así que era invisible aunque técnicamente
  // "estuviera ahí". Confirmado visualmente con captura antes/después. El
  // fix es que el SVG lleve su propio fondo blanco fijo (envolverSvg), no
  // que dependa del fondo de la página que lo rodea.
  test('el SVG trae su propio fondo blanco, para que el texto sea legible sin importar el tema de la tarjeta que lo contiene', async () => {
    const datos = [
      { etiqueta: 'Apache Log4j', valor: 12 },
      { etiqueta: 'OpenSSL', valor: 7 }
    ];

    const svg = (await adapter.renderizarBarrasHorizontales(datos, 'svg')) as string;
    expect(svg).toMatch(/<rect[^>]*fill="#ffffff"/);
  });

  test('renderizarPastel: una porción (path) por categoría con datos', async () => {
    const datos = [
      { etiqueta: 'Crítica', valor: 3 },
      { etiqueta: 'Alta', valor: 1 },
      { etiqueta: 'Media', valor: 0 },
      { etiqueta: 'Baja', valor: 0 }
    ];

    const svg = (await adapter.renderizarPastel(datos, 'svg')) as string;

    // Las porciones con valor 0 no aportan ángulo — solo 2 arcos reales.
    expect((svg.match(/<path/g) ?? []).length).toBe(2);
    // Bug real reportado con capturas: la leyenda mostraba los cuadritos de
    // color pero sin texto al lado — el nombre de categoría y el
    // porcentaje ya estaban en el SVG (dibujarPastel los arma desde
    // siempre), el problema real era de contraste en modo oscuro (ver test
    // de fondo blanco más arriba), no de contenido faltante.
    expect(svg).toContain('Crítica: 3 (75.0%)');
    expect(svg).toContain('Alta: 1 (25.0%)');
    expect(svg).toMatch(/<rect[^>]*fill="#ffffff"/);
  });

  test('renderizarBoxplot: dibuja la caja según el resumen de cinco números recibido, no un placeholder fijo', async () => {
    const resumenA = { minimo: 0, q1: 2, mediana: 5, q3: 8, maximo: 10, media: 5 };
    const resumenB = { minimo: 1, q1: 1, mediana: 1, q3: 1, maximo: 1, media: 1 };

    const svgA = (await adapter.renderizarBoxplot(resumenA, 'svg')) as string;
    const svgB = (await adapter.renderizarBoxplot(resumenB, 'svg')) as string;

    expect(svgA).not.toBe(svgB);
  });

  test('renderizarDispersion: un punto por par (x,y), y muestra la correlación recibida', async () => {
    const puntos = [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
      { x: 3, y: 15 }
    ];

    const svg = (await adapter.renderizarDispersion({ puntos, correlacion: 0.42 }, 'svg')) as string;

    expect((svg.match(/<circle/g) ?? []).length).toBe(3);
    expect(svg).toContain('0.42');
  });

  test('escapa texto con caracteres especiales de XML en las etiquetas (no rompe el SVG)', async () => {
    const datos = [{ etiqueta: 'R&D <Tool> "especial"', valor: 3 }];

    const svg = (await adapter.renderizarBarras(datos, 'svg')) as string;

    expect(svg).toContain('R&amp;D &lt;Tool&gt;');
    expect(svg).not.toContain('<Tool>');
  });

  test('formato json sigue devolviendo el passthrough {tipo, datos} tal cual (comportamiento preexistente, no debe romperse)', async () => {
    const datos = [{ etiqueta: 'Crítica', valor: 5 }];
    const resultado = await adapter.renderizarBarras(datos, 'json');
    expect(resultado).toEqual({ tipo: 'barras', datos });
  });

  // RF-61: png y pdf son archivos reales. Antes los 6 métodos devolvían un
  // SVG con el texto "Exportación pendiente" (y estos tests fijaban ese
  // aviso); se reemplazan por la verificación de los archivos de verdad.
  const FIRMA_PNG = '89504e470d0a1a0a';
  const datosPorMetodo: Array<[string, (formato: 'png' | 'pdf' | 'svg') => Promise<unknown>]> = [
    ['renderizarHistograma', (formato) => adapter.renderizarHistograma({ bins: [{ intervalo: '0-2', frecuencia: 3 }, { intervalo: '2-4', frecuencia: 5 }], media: 2.5, mediana: 2 }, formato, 'Histograma de CVSS', 'CVSS Score')],
    ['renderizarBarras', (formato) => adapter.renderizarBarras([{ etiqueta: 'Crítica', valor: 5 }, { etiqueta: 'Alta', valor: 2 }], formato)],
    ['renderizarPastel', (formato) => adapter.renderizarPastel([{ etiqueta: 'Crítica', valor: 5 }, { etiqueta: 'Baja', valor: 1 }], formato)],
    ['renderizarBoxplot', (formato) => adapter.renderizarBoxplot({ minimo: 0, q1: 2, mediana: 5, q3: 8, maximo: 10, media: 5 }, formato)],
    ['renderizarDispersion', (formato) => adapter.renderizarDispersion({ puntos: [{ x: 1, y: 2 }, { x: 3, y: 9 }, { x: 5, y: 4 }], correlacion: 0.5 }, formato)],
    ['renderizarBarrasHorizontales', (formato) => adapter.renderizarBarrasHorizontales([{ etiqueta: 'Apache Log4j', valor: 12 }, { etiqueta: 'OpenSSL', valor: 7 }], formato)]
  ];

  test.each(datosPorMetodo)('%s: formato png devuelve un PNG real a 300 dpi, del mismo gráfico que el SVG', async (_metodo, renderizar) => {
    const png = (await renderizar('png')) as Buffer;

    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).toString('hex')).toBe(FIRMA_PNG);
    const metadatos = await sharp(png).metadata();
    expect(metadatos.density).toBe(300);
    // El SVG mide 460 unidades de ancho a 72 por pulgada: a 300 dpi son 1917 px.
    expect(metadatos.width).toBe(Math.round((460 * 300) / 72));
    // No es una imagen en blanco: tiene más de un color.
    const { channels } = await sharp(png).stats();
    expect(channels.some((canal) => canal.stdev > 1)).toBe(true);
  });

  test.each(datosPorMetodo)('%s: formato pdf devuelve un PDF real de una sola página', async (_metodo, renderizar) => {
    const pdf = (await renderizar('pdf')) as Buffer;

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  });

  test('png y pdf ya no son el aviso de "exportación pendiente"', async () => {
    for (const [, renderizar] of datosPorMetodo) {
      const png = (await renderizar('png')) as Buffer;
      const pdf = (await renderizar('pdf')) as Buffer;
      expect(png.toString('latin1')).not.toContain('pendiente');
      expect(pdf.toString('latin1')).not.toContain('pendiente');
    }
  });

  test('el PDF de un Top 10 es más alto que el de un boxplot: la página se ajusta al gráfico', async () => {
    const altoDePagina = (pdf: Buffer) => Number(/\/MediaBox\s*\[\s*0\s+0\s+[\d.]+\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'))?.[1]);
    const top = (await adapter.renderizarBarrasHorizontales(Array.from({ length: 10 }, (_, i) => ({ etiqueta: `Software ${i}`, valor: 10 - i })), 'pdf')) as Buffer;
    const boxplot = (await adapter.renderizarBoxplot({ minimo: 0, q1: 2, mediana: 5, q3: 8, maximo: 10, media: 5 }, 'pdf')) as Buffer;

    expect(altoDePagina(top)).toBeGreaterThan(altoDePagina(boxplot));
    expect(altoDePagina(boxplot)).toBeLessThan(400);
  });

  test('formato json de los 5 métodos restantes sigue siendo el passthrough {tipo, datos} tal cual (comportamiento preexistente)', async () => {
    expect(await adapter.renderizarPastel([], 'json')).toEqual({ tipo: 'pastel', datos: [] });
    expect(await adapter.renderizarBoxplot({}, 'json')).toEqual({ tipo: 'boxplot', datos: {} });
    expect(await adapter.renderizarDispersion({}, 'json')).toEqual({ tipo: 'dispersion', datos: {} });
    expect(await adapter.renderizarBarrasHorizontales([], 'json')).toEqual({ tipo: 'barrasHorizontales', datos: [] });
    expect(await adapter.renderizarHistograma({}, 'json')).toEqual({ tipo: 'histograma', datos: {} });
  });

  // RF-28 / RF-69 + RF-61: los gráficos por nivel de riesgo llevan escrita la
  // escala con la que se clasificó, también cuando salen como PNG o PDF.
  describe('nota de escala dentro del gráfico', () => {
    const niveles = [
      { etiqueta: 'Bajo', valor: 1 },
      { etiqueta: 'Moderado', valor: 2 },
      { etiqueta: 'Alto', valor: 0 },
      { etiqueta: 'Crítico', valor: 3 }
    ];
    const NOTA = 'Niveles de riesgo según: Escala personalizada: Moderado desde 4.0, Alto desde 7.0, Crítico desde 8.5';
    const altoDeViewBox = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);
    const altoDePagina = (pdf: Buffer) => Number(/\/MediaBox\s*\[\s*0\s+0\s+[\d.]+\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'))?.[1]);

    test('SVG de barras y de pastel: la nota está escrita y el lienzo crece para no tapar nada', async () => {
      const barrasSin = (await adapter.renderizarBarras(niveles, 'svg', 'Barras por nivel de riesgo')) as string;
      const barrasCon = (await adapter.renderizarBarras(niveles, 'svg', 'Barras por nivel de riesgo', 'Cantidad', 'Nivel de riesgo', NOTA)) as string;
      const pastelCon = (await adapter.renderizarPastel(niveles, 'svg', 'Distribución por nivel de riesgo', NOTA)) as string;

      expect(barrasSin).not.toContain('Niveles de riesgo según');
      expect(barrasCon).toContain(NOTA);
      expect(pastelCon).toContain(NOTA);
      expect(altoDeViewBox(barrasCon)).toBeGreaterThan(altoDeViewBox(barrasSin));
    });

    test('PNG: se rasteriza el mismo SVG con la nota (la imagen sale más alta)', async () => {
      const sin = (await adapter.renderizarBarras(niveles, 'png', 'Barras')) as Buffer;
      const con = (await adapter.renderizarBarras(niveles, 'png', 'Barras', 'Cantidad', 'Nivel de riesgo', NOTA)) as Buffer;

      expect((await sharp(con).metadata()).height!).toBeGreaterThan((await sharp(sin).metadata()).height!);
    });

    test('PDF de barras y de pastel: la página crece para la línea de la nota', async () => {
      const barrasSin = (await adapter.renderizarBarras(niveles, 'pdf', 'Barras')) as Buffer;
      const barrasCon = (await adapter.renderizarBarras(niveles, 'pdf', 'Barras', 'Cantidad', 'Nivel de riesgo', NOTA)) as Buffer;
      const pastelSin = (await adapter.renderizarPastel(niveles, 'pdf', 'Pastel')) as Buffer;
      const pastelCon = (await adapter.renderizarPastel(niveles, 'pdf', 'Pastel', NOTA)) as Buffer;

      expect(altoDePagina(barrasCon)).toBeGreaterThan(altoDePagina(barrasSin));
      expect(altoDePagina(pastelCon)).toBeGreaterThan(altoDePagina(pastelSin));
    });

    test('los colores de los niveles se reconocen con los nombres nuevos', async () => {
      const pastel = (await adapter.renderizarPastel(niveles, 'svg', 'Pastel')) as string;
      expect(pastel).toContain('#8B0000');
      expect(pastel).toContain('#ffd700');
    });
  });
});

