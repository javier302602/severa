import PDFDocument from 'pdfkit';
import {
  DocConIndice,
  completarIndice,
  dibujarTabla,
  nuevaSeccion,
  parrafo,
  reservarPaginaDeIndice
} from '../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf';
import { recopilarDatosDeInformeDataset } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInformeDataset';
import { renderizarInformeUniversal } from '../../../../../src/infrastructure/adapters/out/reportes/InformeUniversalRF130';

// Errores de maquetado del informe PDF que se veían al abrir un informe real
// y que ningún test detectaba, porque los tests del PDF comprueban qué texto
// se dibuja y no dónde. Acá se comprueba la posición.
function nuevoDocumento(): PDFKit.PDFDocument {
  return new PDFDocument({ margin: 72, size: 'LETTER', bufferPages: true });
}

interface TextoDibujado {
  texto: string;
  x: number | undefined;
  y: number | undefined;
  opciones: PDFKit.Mixins.TextOptions | undefined;
}

function espiarTextos(): { textos: () => TextoDibujado[]; restaurar: () => void } {
  const spy = jest.spyOn(PDFDocument.prototype, 'text');
  return {
    textos: () =>
      spy.mock.calls
        .filter((llamada) => typeof llamada[0] === 'string')
        .map((llamada) => {
          const [texto, x, y, opciones] = llamada as [string, unknown, unknown, unknown];
          const posicionada = typeof x === 'number';
          return {
            texto,
            x: posicionada ? (x as number) : undefined,
            y: posicionada ? (y as number) : undefined,
            opciones: (posicionada ? opciones : x) as PDFKit.Mixins.TextOptions | undefined
          };
        }),
    restaurar: () => spy.mockRestore()
  };
}

describe('dibujarTabla', () => {
  test('después de una tabla, el texto siguiente vuelve al margen izquierdo y ocupa todo el ancho', () => {
    const doc = nuevoDocumento();

    dibujarTabla(
      doc,
      ['Columna', 'Q1', 'Q3'],
      [
        ['edad', '27', '48'],
        ['ingreso', '2201', '2727']
      ]
    );

    // Antes quedaba en la x de la última columna: el párrafo siguiente se
    // escribía como una tira angosta contra el margen derecho.
    expect(doc.x).toBe(72);

    const espia = espiarTextos();
    parrafo(doc, 'Se detectaron 5 valores atípicos en total, concentrados en "ingreso".');
    const [dibujado] = espia.textos();
    espia.restaurar();
    expect(dibujado.x).toBeUndefined();
    expect(doc.x).toBe(72);
  });

  test('con celdas de una sola línea, cada fila mide 16 pt (el alto de siempre)', () => {
    const doc = nuevoDocumento();
    const espia = espiarTextos();

    dibujarTabla(doc, ['A', 'B'], [['uno', 'dos'], ['tres', 'cuatro'], ['cinco', 'seis']]);

    const ys = espia.textos().filter((texto) => ['A', 'uno', 'tres', 'cinco'].includes(texto.texto)).map((texto) => texto.y as number);
    espia.restaurar();
    expect(ys.slice(1).map((y, indice) => y - ys[indice])).toEqual([16, 16, 16]);
  });

  test('una celda que no entra en una línea agranda su fila: la fila siguiente empieza debajo del texto, no encima', () => {
    const doc = nuevoDocumento();
    const largo = 'eliminación de filas con el valor faltante en la variable más larga del dataset, con mucho detalle';
    const espia = espiarTextos();

    dibujarTabla(doc, ['Variable', 'Método'], [['ciudad', largo], ['edad', 'media']], [100, 120]);

    const textos = espia.textos();
    espia.restaurar();
    const yFilaLarga = textos.find((texto) => texto.texto === 'ciudad')?.y as number;
    const ySiguiente = textos.find((texto) => texto.texto === 'edad')?.y as number;
    const altoDelTextoLargo = doc.fontSize(8).font('Times-Roman').heightOfString(largo, { width: 120 - 8 });

    expect(altoDelTextoLargo).toBeGreaterThan(16);
    expect(ySiguiente - yFilaLarga).toBeGreaterThanOrEqual(altoDelTextoLargo);
  });

  test('un encabezado que no entra en una línea también agranda su fila', () => {
    const doc = nuevoDocumento();
    const espia = espiarTextos();

    dibujarTabla(doc, ['Límite inferior del rango intercuartílico (IQR)', 'B'], [['1', '2']], [60, 60]);

    const textos = espia.textos();
    espia.restaurar();
    const yEncabezado = textos.find((texto) => texto.texto === 'B')?.y as number;
    const yPrimeraFila = textos.find((texto) => texto.texto === '1')?.y as number;
    expect(yPrimeraFila - yEncabezado).toBeGreaterThan(16);
  });

  test('una tabla sin filas dibuja solo el encabezado y no rompe', () => {
    const doc = nuevoDocumento();

    expect(() => dibujarTabla(doc, ['A', 'B'], [])).not.toThrow();
    expect(doc.x).toBe(72);
  });
});

describe('completarIndice', () => {
  test('cada entrada es una sola línea: título a la izquierda y página a la derecha, a la misma altura', () => {
    const doc = nuevoDocumento();
    doc.text('portada');
    const paginaDeIndice = reservarPaginaDeIndice(doc);
    ['Resumen ejecutivo', 'Valores faltantes', 'Análisis individual de variables'].forEach((titulo, indice) => {
      nuevaSeccion(doc, String(indice + 2), titulo);
      doc.text('contenido');
    });

    const espia = espiarTextos();
    completarIndice(doc, paginaDeIndice);
    const textos = espia.textos();
    espia.restaurar();

    const entradas = (doc as DocConIndice)._entradasIndice ?? [];
    expect(entradas).toHaveLength(3);
    entradas.forEach((entrada) => {
      const titulo = textos.find((texto) => texto.texto === `${entrada.numero}. ${entrada.titulo}`);
      const pagina = textos.find((texto) => texto.texto === `pág. ${entrada.pagina}` && texto.y === titulo?.y);

      expect(titulo).toMatchObject({ x: 72 });
      expect(titulo?.opciones).toMatchObject({ lineBreak: false });
      // Alineada a la derecha dentro del ancho útil (612 - 2 × 72).
      expect(pagina).toBeDefined();
      expect(pagina?.opciones).toMatchObject({ align: 'right', width: 468, lineBreak: false });
    });
    // Ninguna línea es "título + espacios + página" armada a mano.
    expect(textos.some((texto) => / {5,}pág\\. /.test(texto.texto))).toBe(false);
  });
});

describe('sección 12 (Visualizaciones) del informe genérico', () => {
  test('la primera figura va en la misma página que el título de la sección; las siguientes, cada una en la suya', async () => {
    const filas = Array.from({ length: 12 }, (_, i) => ({ edad: 20 + i, ingreso: 1000 + ((i * 37) % 11) * 100 }));
    const datos = recopilarDatosDeInformeDataset(['edad', 'ingreso'], filas, 'Analista de Prueba');
    const spyTexto = jest.spyOn(PDFDocument.prototype, 'text');
    const spyPagina = jest.spyOn(PDFDocument.prototype, 'addPage');

    await renderizarInformeUniversal({ pipeline: 'generico', datos });

    const ordenDe = (prefijo: string): number => {
      const indice = spyTexto.mock.calls.findIndex((llamada) => typeof llamada[0] === 'string' && (llamada[0] as string).startsWith(prefijo));
      if (indice === -1) throw new Error(`no se dibujó "${prefijo}"`);
      return spyTexto.mock.invocationCallOrder[indice];
    };
    // Se copia antes de restaurar los espías: restaurarlos borra su registro.
    const paginas = [...spyPagina.mock.invocationCallOrder];
    const paginasEntre = (desde: number, hasta: number): number => paginas.filter((orden) => orden > desde && orden < hasta).length;

    const titulo = ordenDe('12. Visualizaciones');
    const figura1 = ordenDe('12.1 ');
    const figura2 = ordenDe('12.2 ');
    const figura3 = ordenDe('12.3 ');
    spyTexto.mockRestore();
    spyPagina.mockRestore();

    expect(paginas.length).toBeGreaterThan(10);
    expect(paginasEntre(titulo, figura1)).toBe(0);
    expect(paginasEntre(figura1, figura2)).toBe(1);
    expect(paginasEntre(figura2, figura3)).toBe(1);
  });
});
