#!/usr/bin/env node
'use strict';

// Prueba de carga (Mejora 4, cierre de bloque) — script standalone, NO se
// ejecuta en producción ni en Docker (mismo motivo que scripts/migrate.js
// para preferir JS plano: no depende de ts-node/typescript como
// devDependency). Pagina contra la API pública y documentada de NVD
// (https://services.nvd.nist.gov/rest/json/cves/2.0 — la misma URL base que
// ya usa NvdApiClientHttp.ts, pero ESE cliente no pagina: hace un único GET
// esperando que la respuesta completa venga en un solo request, lo cual no
// es cómo funciona la API real de NVD 2.0. Este script sí implementa la
// paginación real (resultsPerPage/startIndex) para juntar un dataset grande
// de verdad).
//
// Con NVD_API_KEY seteada: 50 requests/30s (documentado por NVD). Sin key:
// 5 requests/30s. El delay entre requests se ajusta solo.
//
// Genera DOS archivos a partir de los MISMOS CVEs descargados:
//   1. dataset-vulnerabilidades-nvd.xlsx — columnas fijas que espera el
//      módulo de vulnerabilidades (CVE, Software, CVSS Score, Acceso
//      Remoto, Tipo Vulnerabilidad, Dias para Parche — ver
//      LectorExcelDataset.ts, COLUMNA_POR_DEFECTO/ALIAS_*).
//   2. dataset-analisis-datos-nvd.csv — mismos CVEs, sin asumir ESE
//      esquema fijo: columnas descriptivas genéricas para ejercitar el
//      módulo de Análisis de Datos General con tipos variados (numérica,
//      categórica, fecha, texto de alta cardinalidad).
//
// "Dias para Parche" y "Dias_Desde_Publicacion" son un PROXY derivado de
// fechas reales de NVD (lastModified - published), no un dato que NVD
// reporte directamente — no existe un campo real de "tiempo hasta el
// parche" en la API pública. Documentado acá y en el reporte al usuario
// para no hacer pasar un proxy por un dato real sin aclararlo.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');

const NVD_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
// .env de este proyecto trae NVD_API_KEY="your_nvd_api_key_here" como
// placeholder (nunca se seteó una key real todavía) — confirmado en vivo
// que mandarle ESE string a NVD como apiKey rompe el request con 404 (en
// vez de simplemente no autenticar), así que se descarta explícitamente en
// vez de confiar en que cualquier valor no vacío es una key real.
const NVD_API_KEY_CRUDA = process.env.NVD_API_KEY || '';
const API_KEY = /^your_.*_here$/i.test(NVD_API_KEY_CRUDA.trim()) ? '' : NVD_API_KEY_CRUDA;
const RESULTS_PER_PAGE = Number(process.env.NVD_RESULTS_PER_PAGE || 2000);
const TARGET_CVES = Number(process.env.NVD_CVE_TARGET || 15000);
const OUTPUT_DIR = process.env.NVD_OUTPUT_DIR || path.join(__dirname, 'output');
const DELAY_MS = API_KEY ? 700 : 6500;
const MAX_REINTENTOS = 5;

const MAPA_CWE_A_NOMBRE = {
  'CWE-79': 'Cross-Site Scripting (XSS)',
  'CWE-89': 'SQL Injection',
  'CWE-78': 'OS Command Injection',
  'CWE-119': 'Buffer Overflow',
  'CWE-120': 'Buffer Overflow',
  'CWE-125': 'Out-of-bounds Read',
  'CWE-787': 'Out-of-bounds Write',
  'CWE-22': 'Path Traversal',
  'CWE-352': 'Cross-Site Request Forgery (CSRF)',
  'CWE-434': 'Unrestricted File Upload',
  'CWE-269': 'Improper Privilege Management',
  'CWE-287': 'Improper Authentication',
  'CWE-798': 'Hardcoded Credentials',
  'CWE-502': 'Deserialization of Untrusted Data',
  'CWE-611': 'XML External Entity (XXE)',
  'CWE-863': 'Incorrect Authorization',
  'CWE-284': 'Improper Access Control',
  'CWE-476': 'NULL Pointer Dereference',
  'CWE-416': 'Use After Free',
  'CWE-190': 'Integer Overflow'
};

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extraerCvss(cve) {
  const metricas = cve.metrics || {};
  const v31 = metricas.cvssMetricV31 && metricas.cvssMetricV31[0];
  if (v31) return { score: v31.cvssData.baseScore, vector: v31.cvssData.attackVector };
  const v30 = metricas.cvssMetricV30 && metricas.cvssMetricV30[0];
  if (v30) return { score: v30.cvssData.baseScore, vector: v30.cvssData.attackVector };
  const v2 = metricas.cvssMetricV2 && metricas.cvssMetricV2[0];
  if (v2) return { score: v2.cvssData.baseScore, vector: v2.cvssData.accessVector };
  return null;
}

function extraerSoftware(cve) {
  const nodos = (cve.configurations || []).flatMap((c) => c.nodes || []);
  for (const nodo of nodos) {
    for (const match of nodo.cpeMatch || []) {
      // cpe:2.3:a:vendor:product:version:... — partes 3 y 4 son vendor/product.
      const partes = String(match.criteria || '').split(':');
      if (partes.length > 4 && partes[4]) {
        const vendor = partes[3];
        const producto = partes[4];
        return `${capitalizar(vendor)} ${capitalizar(producto)}`.trim();
      }
    }
  }
  return 'Desconocido';
}

function capitalizar(texto) {
  if (!texto || texto === '*' || texto === '-') return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(/_/g, ' ');
}

function extraerCwe(cve) {
  const debilidades = cve.weaknesses || [];
  for (const debilidad of debilidades) {
    const desc = (debilidad.description || []).find((d) => d.lang === 'en');
    if (desc && /^CWE-\d+$/.test(desc.value)) return desc.value;
  }
  return null;
}

function extraerDescripcion(cve) {
  const desc = (cve.descriptions || []).find((d) => d.lang === 'en');
  return desc ? desc.value : '';
}

async function descargarPagina(startIndex, intento = 1) {
  try {
    const respuesta = await axios.get(NVD_BASE_URL, {
      params: { resultsPerPage: RESULTS_PER_PAGE, startIndex },
      headers: API_KEY ? { apiKey: API_KEY } : {},
      timeout: 30000
    });
    return respuesta.data;
  } catch (error) {
    const status = error.response && error.response.status;
    if ((status === 403 || status === 429 || status >= 500) && intento <= MAX_REINTENTOS) {
      const espera = DELAY_MS * intento * 2;
      console.warn(`  [reintento ${intento}/${MAX_REINTENTOS}] status=${status} — esperando ${espera}ms antes de reintentar startIndex=${startIndex}`);
      await esperar(espera);
      return descargarPagina(startIndex, intento + 1);
    }
    throw error;
  }
}

function filaVulnerabilidades(cve, cvss) {
  const cwe = extraerCwe(cve);
  return {
    CVE: cve.id,
    Software: extraerSoftware(cve),
    'CVSS Score': cvss.score,
    'Acceso Remoto': cvss.vector === 'NETWORK' ? 'Sí' : 'No',
    'Tipo Vulnerabilidad': cwe ? (MAPA_CWE_A_NOMBRE[cwe] || cwe) : 'Sin clasificar',
    'Dias para Parche': diasEntre(cve.published, cve.lastModified)
  };
}

function diasEntre(desde, hasta) {
  if (!desde || !hasta) return '';
  const dias = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000);
  return Math.max(0, dias);
}

function filaAnalisisDatos(cve, cvss) {
  const cwe = extraerCwe(cve);
  return {
    CVE_ID: cve.id,
    Descripcion: extraerDescripcion(cve).slice(0, 300),
    CVSS_Score: cvss.score,
    Vector_Ataque: cvss.vector || 'DESCONOCIDO',
    Severidad: clasificarSeveridad(cvss.score),
    CWE: cwe || 'Sin clasificar',
    Software: extraerSoftware(cve),
    Fecha_Publicacion: cve.published ? cve.published.slice(0, 10) : '',
    Fecha_Ultima_Modificacion: cve.lastModified ? cve.lastModified.slice(0, 10) : '',
    Dias_Desde_Publicacion: diasEntre(cve.published, cve.lastModified)
  };
}

function clasificarSeveridad(score) {
  if (score >= 9.0) return 'Crítica';
  if (score >= 7.0) return 'Alta';
  if (score >= 4.0) return 'Media';
  return 'Baja';
}

async function main() {
  console.log(`Objetivo: ${TARGET_CVES} CVEs reales de NVD (${API_KEY ? 'CON' : 'SIN'} API key, ${DELAY_MS}ms entre requests)`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const filasVulns = [];
  const filasGenerico = [];
  let startIndex = 0;
  let totalResults = Infinity;
  let paginas = 0;
  let omitidos = 0;
  const inicio = Date.now();

  while (filasVulns.length < TARGET_CVES && startIndex < totalResults) {
    const inicioPagina = Date.now();
    const data = await descargarPagina(startIndex);
    const duracionPagina = Date.now() - inicioPagina;
    paginas += 1;
    totalResults = data.totalResults;

    for (const item of data.vulnerabilities || []) {
      const cve = item.cve;
      const cvss = extraerCvss(cve);
      if (!cvss || !cve.id) {
        omitidos += 1;
        continue;
      }
      filasVulns.push(filaVulnerabilidades(cve, cvss));
      filasGenerico.push(filaAnalisisDatos(cve, cvss));
    }

    console.log(
      `  página ${paginas} — startIndex=${startIndex} — ${data.vulnerabilities.length} CVEs (${duracionPagina}ms) — acumulado=${filasVulns.length}/${TARGET_CVES} — totalResults NVD=${totalResults}`
    );

    startIndex += RESULTS_PER_PAGE;
    if (filasVulns.length < TARGET_CVES && startIndex < totalResults) {
      await esperar(DELAY_MS);
    }
  }

  const duracionTotalMs = Date.now() - inicio;

  const rutaVulns = path.join(OUTPUT_DIR, 'dataset-vulnerabilidades-nvd.xlsx');
  const wsVulns = XLSX.utils.json_to_sheet(filasVulns);
  const wbVulns = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbVulns, wsVulns, 'Vulnerabilidades');
  XLSX.writeFile(wbVulns, rutaVulns);

  const rutaGenerico = path.join(OUTPUT_DIR, 'dataset-analisis-datos-nvd.csv');
  const wsGenerico = XLSX.utils.json_to_sheet(filasGenerico);
  fs.writeFileSync(rutaGenerico, XLSX.utils.sheet_to_csv(wsGenerico));

  console.log('\n=== Resumen ===');
  console.log(`Requests a NVD: ${paginas}`);
  console.log(`CVEs descargados y válidos: ${filasVulns.length}`);
  console.log(`CVEs omitidos (sin CVSS o sin id): ${omitidos}`);
  console.log(`Tiempo total de descarga: ${(duracionTotalMs / 1000).toFixed(1)}s`);
  console.log(`Archivo módulo vulnerabilidades: ${rutaVulns}`);
  console.log(`Archivo módulo análisis de datos: ${rutaGenerico}`);
}

main().catch((error) => {
  console.error('Error generando el dataset de carga:', error.response ? `HTTP ${error.response.status} ${JSON.stringify(error.response.data)}` : error.message);
  process.exit(1);
});
