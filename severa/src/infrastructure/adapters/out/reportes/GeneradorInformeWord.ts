import { Document, Packer } from 'docx';
import { DatosInforme, DatosInformeDataset } from '../../../../application/ports/out/reportes/GeneradorDeInformes';
import { ESTILOS_APA7, MARGEN_APA7_TWIPS, ElementoDocumento } from './LayoutInformeWord';
import { construirContenidoWord } from './InformeUniversalRF130Word';

// RF-78: genera el .docx real con la librería "docx". No implementa
// GeneradorDeInformes directamente: es un colaborador interno que
// GeneradorInformePDF compone para resolver los métodos generarInformeWord/
// generarInformeDatasetWord del puerto (así el archivo queda separado por
// formato, como se pidió).
//
// M-10 Ronda 2, Pasada 2-D (RF-130): los dos métodos delegan en
// construirContenidoWord() (InformeUniversalRF130Word.ts), el orquestador de
// 20 secciones análogo a renderizarInformeUniversal del lado PDF. Paso 1
// migró generar() (CVSS); Paso 2 migró generarDataset() (genérico) y retiró
// construirContenidoDataset(), la función monolítica de 10 secciones, junto
// con sus dos helpers exclusivos (que se mudaron al orquestador). Con esto
// PDF y Word comparten estructura en los dos pipelines y este archivo queda
// solo con lo que es propio del formato: armar el Document y empaquetarlo.
//
// La librería "docx" no tiene ninguna API de dibujo vectorial (solo puede
// insertar imágenes ya renderizadas vía ImageRun, o texto/tablas) — a
// diferencia de pdfkit, que sí permite pintar rect/line/path directamente.
// Por eso los gráficos se rasterizan a PNG a partir de las mismas funciones
// SVG que ya sirven /graficos/:tipo en pantalla (ver
// RasterizadorDeGraficosWord.ts, que usa "sharp").
function empaquetar(contenido: ElementoDocumento[]): Promise<Buffer> {
  const documento = new Document({
    styles: ESTILOS_APA7,
    sections: [
      {
        properties: { page: { margin: { top: MARGEN_APA7_TWIPS, bottom: MARGEN_APA7_TWIPS, left: MARGEN_APA7_TWIPS, right: MARGEN_APA7_TWIPS } } },
        children: contenido
      }
    ]
  });

  return Packer.toBuffer(documento);
}

export class GeneradorInformeWord {
  async generar(datos: DatosInforme): Promise<Buffer> {
    return empaquetar(await construirContenidoWord({ pipeline: 'cvss', datos }));
  }

  // Fase 5 (Mejora 4 — Análisis de Datos General): mismo patrón, "documento
  // de datos" distinto — ver DatosInformeDataset en GeneradorDeInformes.ts.
  async generarDataset(datos: DatosInformeDataset): Promise<Buffer> {
    return empaquetar(await construirContenidoWord({ pipeline: 'generico', datos }));
  }
}
