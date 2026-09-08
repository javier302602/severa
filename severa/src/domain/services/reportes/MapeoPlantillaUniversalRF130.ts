// RF-130 (M-10): plantilla universal de 20 secciones. Esta ronda NO construye
// la plantilla completa (eso implica decidir cómo se ve cada sección nueva y
// agregar los placeholders "No aplicable"/"Pendiente" al documento real —
// alcance de una ronda futura). Esto es solo el mapeo auditable de qué
// sección de los dos informes que existen HOY (informe CVSS de 12 secciones,
// informe de dataset genérico de 10 secciones — ver GeneradorInformePDF.ts)
// cubre cuál de las 20 secciones de RF-130, y qué falta.
//
// Verificado por MapeoPlantillaUniversalRF130.test.ts: para cada entrada con
// estado distinto de 'no-existe', el test lee GeneradorInformePDF.ts como
// texto y confirma que los títulos citados en `cubiertaPor` existen
// literalmente en el código — si alguien renombra una sección sin actualizar
// este mapeo, el test lo detecta.
export type EstadoSeccionRF130 = 'cubierta' | 'parcial' | 'no-existe' | 'bloqueada-por-M16';

export interface MapeoSeccionRF130 {
  numero: number;
  nombreRF130: string;
  estado: EstadoSeccionRF130;
  // Títulos EXACTOS tal como aparecen hoy en nuevaSeccion()/subseccion() de
  // GeneradorInformePDF.ts (o en RecopilarDatosDeInformeDataset.ts cuando el
  // contenido vive en el DTO, no en un título de sección) — no paráfrasis.
  cubiertaPor: string[];
  nota?: string;
}

export const MAPEO_PLANTILLA_UNIVERSAL_RF130: MapeoSeccionRF130[] = [
  {
    numero: 1,
    nombreRF130: 'Portada',
    estado: 'cubierta',
    cubiertaPor: ['Informe SEVERA — Análisis de Datos General', 'Generado por SEVERA para']
  },
  {
    numero: 2,
    nombreRF130: 'Resumen ejecutivo',
    estado: 'parcial',
    cubiertaPor: ['Resumen Ejecutivo SEVERA'],
    nota: 'RF-82: implementado como documento PDF aparte (GenerarResumenEjecutivo.ts), no como sección dentro del informe completo — no existe versión "resumen ejecutivo" del informe de dataset genérico.'
  },
  {
    numero: 3,
    nombreRF130: 'Descripción del dataset',
    estado: 'cubierta',
    cubiertaPor: ['Descripción del dataset', 'Organización de los datos']
  },
  {
    numero: 4,
    nombreRF130: 'Número de registros/variables',
    estado: 'cubierta',
    cubiertaPor: ['Descripción del dataset'],
    nota: 'Embebido en la prosa de interpretarComposicionDataset() ("El dataset contiene N fila(s) y M columna(s)") y en la portada del informe genérico — no es una sección numerada propia.'
  },
  {
    numero: 5,
    nombreRF130: 'Tipos de variables',
    estado: 'parcial',
    cubiertaPor: ['Descripción del dataset'],
    nota: 'Columna "Tipo detectado" de la tabla de §3 del informe genérico. El informe CVSS no aplica: esquema fijo conocido de antemano (CVE, CVSS Score, etc.), no hay "tipos" que detectar.'
  },
  {
    numero: 6,
    nombreRF130: 'Calidad de datos',
    estado: 'cubierta',
    cubiertaPor: ['Calidad de los datos', 'Origen y calidad de los datos']
  },
  {
    numero: 7,
    nombreRF130: 'Valores faltantes',
    estado: 'cubierta',
    cubiertaPor: ['Descripción del dataset', 'Calidad de los datos'],
    nota: 'Columnas "Faltantes"/"% faltante" de la tabla de §3, y la narrativa de "columna con más valores faltantes" en §4 del informe genérico. No aplica al informe CVSS (esquema fijo, sin valores faltantes por diseño).'
  },
  {
    numero: 8,
    nombreRF130: 'Limpieza realizada',
    estado: 'parcial',
    cubiertaPor: ['Calidad de los datos'],
    nota: 'Solo se reporta el CONTEO de filas duplicadas detectadas (filasDuplicadas) — no existe una bitácora de qué limpieza/transformación se aplicó, porque SEVERA no transforma datos, solo diagnostica.'
  },
  {
    numero: 9,
    nombreRF130: 'Estadística descriptiva',
    estado: 'cubierta',
    cubiertaPor: ['Medidas de tendencia central', 'Medidas de variabilidad', 'Estadísticas descriptivas']
  },
  {
    numero: 10,
    nombreRF130: 'Análisis individual de variables',
    estado: 'parcial',
    cubiertaPor: ['Análisis univariado (columnas numéricas)'],
    nota: 'Solo columnas numéricas, una por una, en el informe genérico. El informe CVSS no tiene un análisis "por variable" separado — CVSS Score es la única variable continua y ya se cubre en tendencia central/variabilidad.'
  },
  {
    numero: 11,
    nombreRF130: 'Distribuciones',
    estado: 'cubierta',
    cubiertaPor: ['Distribución de los datos', 'Análisis univariado (columnas numéricas)']
  },
  {
    numero: 12,
    nombreRF130: 'Visualizaciones',
    estado: 'cubierta',
    cubiertaPor: ['Gráficos explicados en detalle']
  },
  {
    numero: 13,
    nombreRF130: 'Relaciones entre variables',
    estado: 'cubierta',
    cubiertaPor: ['Relación entre CVSS Score y Días para Parche', 'Matriz de correlación']
  },
  {
    numero: 14,
    nombreRF130: 'Análisis inferencial',
    estado: 'no-existe',
    cubiertaPor: [],
    nota: 'El informe declara explícitamente "no inferencial" (sin pruebas de hipótesis). Lo más cercano es la comparación de medias Remoto/Local (RF-131 ya la distingue visualmente como "Comparación entre grupos", no como inferencia formal).'
  },
  {
    numero: 15,
    nombreRF130: 'Predicción',
    estado: 'bloqueada-por-M16',
    cubiertaPor: [],
    nota: 'M-16 (Predicción y Modelado) está explícitamente bloqueado en el código (ver IMotorPrediccion.ts): "pendiente de material académico, no implementar ni sugerir un método hasta recibirlo". Esta sección de RF-130 no puede tener contenido real hasta que M-16 se desbloquee.'
  },
  {
    numero: 16,
    nombreRF130: 'Evaluación de modelos',
    estado: 'bloqueada-por-M16',
    cubiertaPor: [],
    nota: 'Misma dependencia que la sección 15 — no hay modelos que evaluar sin M-16.'
  },
  {
    numero: 17,
    nombreRF130: 'Interpretación',
    estado: 'cubierta',
    cubiertaPor: ['Conclusiones']
  },
  {
    numero: 18,
    nombreRF130: 'Conclusiones',
    estado: 'cubierta',
    cubiertaPor: ['Conclusiones']
  },
  {
    numero: 19,
    nombreRF130: 'Recomendaciones',
    estado: 'parcial',
    cubiertaPor: ['Recomendaciones'],
    nota: 'Existe como subsección dentro de "Conclusiones" en el informe CVSS únicamente — el informe de dataset genérico no tiene ninguna subsección de recomendaciones (decisión ya documentada: no aplica a un dataset arbitrario sin caso de uso conocido).'
  },
  {
    numero: 20,
    nombreRF130: 'Referencias/anexos',
    estado: 'cubierta',
    cubiertaPor: ['Referencias', 'Anexos'],
    nota: 'El informe genérico solo tiene Anexos, no Referencias (decisión ya documentada en el código: las referencias citadas son específicas de CVSS/NVD).'
  }
];
