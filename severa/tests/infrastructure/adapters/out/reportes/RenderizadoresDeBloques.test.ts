import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  BloqueDeInforme,
  titulo,
  subtituloDePortada,
  indice,
  encabezado,
  subtitulo,
  texto,
  etiquetado,
  vineta,
  tabla,
  figura,
  epigrafe
} from '../../../../../src/infrastructure/adapters/out/reportes/BloquesDeInforme';
import { renderizarInformeHtml, escaparHtml } from '../../../../../src/infrastructure/adapters/out/reportes/RenderizadorInformeHtml';
import { renderizarInformeLatex, escaparLatex } from '../../../../../src/infrastructure/adapters/out/reportes/RenderizadorInformeLatex';
import { construirExcelDeTablasDeInforme, extraerTablasDeInforme } from '../../../../../src/infrastructure/adapters/out/reportes/ExportadorTablasDeInformeExcel';
import { empaquetarZip, nombreDeArchivoSeguro } from '../../../../../src/infrastructure/adapters/out/reportes/EmpaquetadorZip';

// M-10 Ronda 2, Pasada 3: renderers de bloques (RF-132 HTML, RF-133 LaTeX,
// RF-79 Excel) probados con un documento chico armado a mano — sin pasar por
// el contenido real del informe, que tiene sus propios tests de punta a
// punta en GeneradorInformeEnFormato.test.ts.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 240"><rect width="10" height="10"/></svg>';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

function documento(): BloqueDeInforme[] {
  return [
    titulo('Informe de prueba'),
    subtituloDePortada('Generado para Ana'),
    texto('Generado: 08/10/2026'),
    indice(),
    encabezado('2. Resumen ejecutivo', true),
    texto('Un párrafo.'),
    etiquetado('Tipo: ', 'Descriptivo'),
    encabezado('3. Datos'),
    subtitulo('Primeros registros'),
    tabla(
      ['Columna', 'Valor'],
      [
        ['a', '1'],
        ['b', '2.50']
      ]
    ),
    subtitulo('12.1 Gráfico 1: Histograma'),
    figura({ titulo: 'Gráfico 1: Histograma', svg: SVG, png: PNG, ancho: 460, alto: 240 }),
    epigrafe('Gráfico 1: Histograma'),
    tabla(['Intervalo', 'Frecuencia'], [['[0-2)', '3']]),
    encabezado('17. Interpretación'),
    vineta('Primer hallazgo'),
    vineta('Segundo hallazgo'),
    texto('Cierre.')
  ];
}

// Texto pensado para romper un renderer que no escapa.
const HOSTIL = '<script>alert("x")</script> & \\input{/etc/passwd} $x^2$ 50% #1 a_b {c} ~d |f|';

describe('RenderizadorInformeHtml (RF-132)', () => {
  test('es un documento HTML completo y autocontenido: sin scripts ni recursos externos', () => {
    const html = renderizarInformeHtml(documento());

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Informe de prueba</title>');
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/\b(src|href)="https?:/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });

  test('el índice enlaza a cada sección de primer nivel, en orden, y cada enlace tiene su ancla', () => {
    const html = renderizarInformeHtml(documento());

    const enlaces = [...html.matchAll(/<li><a href="#(seccion-\d+)">([^<]+)<\/a><\/li>/g)].map((m) => [m[1], m[2]]);
    expect(enlaces).toEqual([
      ['seccion-1', '2. Resumen ejecutivo'],
      ['seccion-2', '3. Datos'],
      ['seccion-3', '17. Interpretación']
    ]);
    enlaces.forEach(([id, textoSeccion]) => expect(html).toContain(`<h2 id="${id}">${textoSeccion}</h2>`));
    // Las subsecciones no entran al índice.
    expect(html).toContain('<h3>Primeros registros</h3>');
  });

  test('tablas, figuras, etiquetas y viñetas quedan con su marcado', () => {
    const html = renderizarInformeHtml(documento());

    expect(html).toContain('<th scope="col">Columna</th><th scope="col">Valor</th>');
    expect(html).toContain('<tr><td>b</td><td>2.50</td></tr>');
    expect(html).toContain('<p><strong>Tipo: </strong>Descriptivo</p>');
    expect(html).toContain('<ul>\n<li>Primer hallazgo</li>\n<li>Segundo hallazgo</li>\n</ul>');
    // La figura va como SVG en línea, con nombre accesible, y su epígrafe.
    expect(html).toMatch(/<figure><svg role="img" aria-label="Gráfico 1: Histograma"[^>]*xmlns=/);
    expect(html).toContain('<p class="epigrafe">Gráfico 1: Histograma</p>');
    expect(html).not.toContain('data:image/png');
  });

  test('todo texto que venga del dataset se escapa: en párrafos, celdas, encabezados, título y atributos', () => {
    const html = renderizarInformeHtml([
      titulo(HOSTIL),
      indice(),
      encabezado(HOSTIL),
      texto(HOSTIL),
      etiquetado(HOSTIL, HOSTIL),
      vineta(HOSTIL),
      tabla([HOSTIL], [[HOSTIL]]),
      figura({ titulo: `" onload="alert(1)`, svg: SVG, png: PNG, ancho: 460, alto: 240 }),
      epigrafe(HOSTIL)
    ]);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;');
    // El título de la figura no puede cerrar el atributo y abrir otro.
    expect(html).toContain('aria-label="&quot; onload=&quot;alert(1)"');
    expect(html).not.toMatch(/<svg[^>]*\sonload="alert/);
  });

  test('escaparHtml cubre los cinco caracteres con significado en HTML', () => {
    expect(escaparHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  test('un documento sin índice ni título no rompe', () => {
    const html = renderizarInformeHtml([texto('solo un párrafo')]);
    expect(html).toContain('<title>Informe SIADE</title>');
    expect(html).toContain('<p>solo un párrafo</p>');
    expect(html).not.toContain('<header');
  });
});

describe('RenderizadorInformeLatex (RF-133)', () => {
  test('documento con preámbulo, índice y cierre; las secciones llevan su propio número y entran al índice a mano', () => {
    const { tex } = renderizarInformeLatex(documento());

    expect(tex).toContain('\\documentclass[11pt,a4paper]{article}');
    expect(tex).toContain('\\begin{document}');
    expect(tex.trimEnd().endsWith('\\end{document}')).toBe(true);
    expect(tex).toContain('\\tableofcontents');
    expect(tex).toContain('\\clearpage\n\\phantomsection\\addcontentsline{toc}{section}{2. Resumen ejecutivo}\n\\section*{2. Resumen ejecutivo}');
    expect(tex).toContain('\\subsection*{Primeros registros}');
    // Sin \section numerada: LaTeX le antepondría su propia numeración.
    expect(tex).not.toMatch(/\\section\{/);
  });

  test('no depende de paquetes que una instalación mínima no trae', () => {
    const { tex } = renderizarInformeLatex(documento());

    expect(tex).toContain('\\IfFileExists{spanish.ldf}');
    expect(tex).toContain('\\IfFileExists{lmodern.sty}');
    expect(tex).not.toMatch(/^\s*\\usepackage\{fontspec\}/m);
    expect(tex).not.toMatch(/\\begin\{figure\}/);
  });

  test('cada figura se referencia por su ruta dentro del paquete y se devuelve como archivo aparte, numeradas en orden', () => {
    const bloques = [...documento(), figura({ titulo: 'Figura 2', svg: SVG, png: Buffer.from('otro'), ancho: 460, alto: 200 })];

    const { tex, figuras } = renderizarInformeLatex(bloques);

    expect(figuras.map((f) => f.ruta)).toEqual(['figuras/figura-01.png', 'figuras/figura-02.png']);
    expect(figuras[0].png).toBe(PNG);
    figuras.forEach((f) => expect(tex).toContain(`\\includegraphics[width=0.85\\linewidth]{${f.ruta}}`));
  });

  test('tablas como longtable de columnas que parten línea, con el encabezado repetido', () => {
    const { tex } = renderizarInformeLatex(documento());

    expect(tex).toContain('\\begin{longtable}{|>{\\raggedright\\arraybackslash}p{');
    expect(tex).toContain('\\textbf{Columna} & \\textbf{Valor} \\\\ \\hline\n\\endhead');
    expect(tex).toContain('b & 2.50 \\\\ \\hline');
    expect((tex.match(/\\begin\{longtable\}/g) ?? []).length).toBe((tex.match(/\\end\{longtable\}/g) ?? []).length);
  });

  test('una fila con menos celdas que columnas se completa (longtable no compila con una fila corta)', () => {
    const { tex } = renderizarInformeLatex([tabla(['a', 'b', 'c'], [['1']])]);
    expect(tex).toContain('1 &  &  \\\\ \\hline');
  });

  test('viñetas consecutivas forman una sola lista, que se cierra antes del bloque siguiente', () => {
    const { tex } = renderizarInformeLatex(documento());
    expect(tex).toContain('\\begin{itemize}\n  \\item Primer hallazgo\n  \\item Segundo hallazgo\n\\end{itemize}');
    expect(tex.indexOf('\\end{itemize}')).toBeLessThan(tex.indexOf('Cierre.'));
  });

  test('escaparLatex neutraliza los caracteres especiales y los comandos', () => {
    const escapado = escaparLatex(HOSTIL);

    expect(escapado).toBe(
      '\\textless{}script\\textgreater{}alert(\\symbol{34}x\\symbol{34})\\textless{}/script\\textgreater{} \\& ' +
        '\\textbackslash{}input\\{/etc/passwd\\} \\$x\\textasciicircum{}2\\$ 50\\% \\#1 a\\_b \\{c\\} \\textasciitilde{}d \\textbar{}f\\textbar{}'
    );
    // Ninguna barra invertida del texto original sobrevive como inicio de comando.
    expect(escapado).not.toContain('\\input');
  });

  test('escaparLatex: símbolos del propio informe, la media muestral y saltos de línea', () => {
    expect(escaparLatex('Media: x\u0304 = Σxi / n')).toBe('Media: \\(\\bar{x}\\) = \\(\\Sigma\\)xi / n');
    expect(escaparLatex('1.5×IQR — rango')).toBe('1.5\\(\\times\\)IQR --- rango');
    expect(escaparLatex('línea 1\nlínea 2')).toBe('línea 1 línea 2');
    expect(escaparLatex('Año, ñandú, ¿qué?, «cita»')).toBe('Año, ñandú, ¿qué?, \\guillemotleft{}cita\\guillemotright{}');
  });

  test('escaparLatex: lo que pdfLaTeX no puede componer pasa por \\siadeunicode, y los caracteres de control se descartan', () => {
    expect(escaparLatex('αβ')).toBe('\\siadeunicode{3B1}\\siadeunicode{3B2}');
    expect(escaparLatex('日本')).toBe('\\siadeunicode{65E5}\\siadeunicode{672C}');
    expect(escaparLatex('ok🙂')).toBe('ok\\siadeunicode{1F642}');
    // Dentro del rango latino pero sin glifo en pdfLaTeX.
    expect(escaparLatex('Ħ')).toBe('\\siadeunicode{126}');
    expect(escaparLatex('a\u0007b\u0000c')).toBe('abc');
    // Espacio de no separación: un espacio irrompible de LaTeX.
    expect(escaparLatex('10\u00a0km')).toBe('10~km');
  });

  test('el texto hostil nunca llega crudo al .tex, venga del bloque que venga', () => {
    const { tex } = renderizarInformeLatex([
      titulo(HOSTIL),
      subtituloDePortada(HOSTIL),
      encabezado(HOSTIL),
      subtitulo(HOSTIL),
      texto(HOSTIL),
      etiquetado(HOSTIL, HOSTIL),
      vineta(HOSTIL),
      tabla([HOSTIL], [[HOSTIL]]),
      epigrafe(HOSTIL)
    ]);
    const cuerpo = tex.slice(tex.indexOf('\\begin{document}'));

    expect(cuerpo).not.toContain('\\input{');
    expect(cuerpo).not.toContain('<script>');
    expect(cuerpo).not.toMatch(/[^\\]%/);
    expect(cuerpo).not.toMatch(/[^\\]#/);
  });
});

describe('ExportadorTablasDeInformeExcel (RF-79)', () => {
  async function abrir(bloques: BloqueDeInforme[]): Promise<ExcelJS.Workbook> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await construirExcelDeTablasDeInforme(bloques)) as unknown as ArrayBuffer);
    return libro;
  }

  test('extraerTablasDeInforme: cada tabla sabe bajo qué sección y subsección apareció', () => {
    expect(extraerTablasDeInforme(documento()).map((t) => [t.seccion, t.subseccion, t.filas.length])).toEqual([
      ['3. Datos', 'Primeros registros', 2],
      ['3. Datos', '12.1 Gráfico 1: Histograma', 1]
    ]);
  });

  test('una hoja por tabla, más un índice que dice de qué sección salió cada una', async () => {
    const libro = await abrir(documento());

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Índice', '1. Primeros registros', '2. Gráfico 1 Histograma']);
    const indiceHoja = libro.getWorksheet('Índice')!;
    expect(indiceHoja.getCell('A1').value).toBe('Informe de prueba');
    expect(indiceHoja.getRow(5).values).toEqual(expect.arrayContaining(['3. Datos', 'Primeros registros', 2]));
    // La primera columna del índice es un enlace a la hoja.
    expect(indiceHoja.getCell('A5').value).toEqual(expect.objectContaining({ text: '1. Primeros registros', hyperlink: "#'1. Primeros registros'!A1" }));
  });

  test('los números del informe llegan como números (para poder sumarlos), lo demás como texto', async () => {
    const libro = await abrir([
      encabezado('1. Tabla'),
      tabla(
        ['Texto', 'Entero', 'Decimal', 'Negativo', 'Porcentaje', 'Código', 'Intervalo', 'Largo'],
        [['abc', '12', '7.50', '-3.25', '12.5%', '00123', '[0-2)', '12345678901234567890']]
      )
    ]);
    const fila = libro.worksheets[1].getRow(2);

    expect(fila.getCell(1).value).toBe('abc');
    expect(fila.getCell(2).value).toBe(12);
    expect(fila.getCell(3).value).toBe(7.5);
    expect(fila.getCell(4).value).toBe(-3.25);
    // Convertirlos exigiría adivinar formato o perdería información.
    expect(fila.getCell(5).value).toBe('12.5%');
    expect(fila.getCell(6).value).toBe('00123');
    expect(fila.getCell(7).value).toBe('[0-2)');
    expect(fila.getCell(8).value).toBe('12345678901234567890');
  });

  test('un valor de celda que parece fórmula se guarda como texto, no se evalúa', async () => {
    const libro = await abrir([encabezado('1. Tabla'), tabla(['Dato'], [['=HYPERLINK("http://malo","clic")'], ['+SUM(A1:A9)'], ['@cmd']])]);
    const hoja = libro.worksheets[1];

    ['=HYPERLINK("http://malo","clic")', '+SUM(A1:A9)', '@cmd'].forEach((valor, posicion) => {
      const celda = hoja.getCell(`A${posicion + 2}`);
      expect(celda.value).toBe(valor);
      expect(celda.type).toBe(ExcelJS.ValueType.String);
    });
  });

  test('nombres de hoja válidos para Excel: 31 caracteres, sin caracteres prohibidos, sin repetidos', async () => {
    const largo = 'Distribución de una variable con un nombre larguísimo: [a/b]*?';
    const libro = await abrir([
      encabezado('11. Distribuciones'),
      subtitulo(largo),
      tabla(['x'], [['1']]),
      subtitulo('Precio'),
      tabla(['x'], [['1']]),
      subtitulo('precio'),
      tabla(['x'], [['1']]),
      subtitulo('2024 ventas'),
      tabla(['x'], [['1']])
    ]);
    const nombres = libro.worksheets.map((hoja) => hoja.name);

    nombres.forEach((nombre) => {
      expect(nombre.length).toBeLessThanOrEqual(31);
      expect(nombre).not.toMatch(/[\\/?*[\]:]/);
    });
    expect(new Set(nombres.map((nombre) => nombre.toLowerCase())).size).toBe(nombres.length);
    // "2024 ventas" es el nombre de una columna, no una numeración a quitar.
    expect(nombres).toContain('4. 2024 ventas');
  });

  test('un informe sin ninguna tabla produce un libro válido con solo el índice', async () => {
    const libro = await abrir([titulo('Vacío'), texto('nada')]);
    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Índice']);
    expect(libro.getWorksheet('Índice')!.getCell('A2').value).toBe('0 tabla(s) del informe, una por hoja.');
  });
});

describe('EmpaquetadorZip', () => {
  test('empaqueta texto y binario, y el resultado se puede volver a abrir', async () => {
    const buffer = await empaquetarZip([
      { ruta: 'informe.tex', contenido: 'hola ñ' },
      { ruta: 'figuras/figura-01.png', contenido: PNG }
    ]);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(buffer);
    expect(await zip.file('informe.tex')!.async('string')).toBe('hola ñ');
    expect((await zip.file('figuras/figura-01.png')!.async('nodebuffer')).equals(PNG)).toBe(true);
  });

  test('es determinista: el mismo contenido da el mismo zip byte a byte', async () => {
    const archivos = [{ ruta: 'a.txt', contenido: 'uno' }];
    expect((await empaquetarZip(archivos)).equals(await empaquetarZip(archivos))).toBe(true);
  });

  test('nombreDeArchivoSeguro: sin separadores de ruta, acentos ni caracteres que Windows rechaza', () => {
    expect(nombreDeArchivoSeguro('Distribución de "Precio"')).toBe('distribucion-de-precio');
    expect(nombreDeArchivoSeguro('../../etc/passwd')).toBe('etc-passwd');
    expect(nombreDeArchivoSeguro('a<b>c:d|e?f*g')).toBe('a-b-c-d-e-f-g');
    expect(nombreDeArchivoSeguro('日本語')).toBe('sin-titulo');
    expect(nombreDeArchivoSeguro('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
