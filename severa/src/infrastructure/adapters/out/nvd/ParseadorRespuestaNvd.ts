import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../domain/value-objects/TipoAcceso';
import { FilaImportable, FilaRechazada } from '../dataset/LectorExcelDataset';

// Anticorruption layer para la API pública de NVD 2.0
// (services.nvd.nist.gov/rest/json/cves/2.0): traduce SU formato JSON al
// mismo par {importables, rechazadas} que ya produce LectorExcelDataset, para
// que ImportarDataset/ImportarDatasetConAuditoria reciban exactamente la
// misma forma sin importar si el origen fue un Excel o la API real de NVD.
//
// Bug de fondo encontrado en vivo (2026-07-17): NvdApiClientHttp.ts pedía
// config.nvdApiBaseUrl esperando recibir un buffer de .xlsx y pasarlo tal
// cual a LectorExcelDataset — pero la API real de NVD devuelve JSON, nunca
// existió este parser. Sin él, "importar desde link" con la URL real de NVD
// nunca pudo funcionar (confirmado: la sync tampoco, apuntaba a un host que
// ni siquiera resuelve).

interface CvssDataNvd {
  baseScore: number;
  attackVector?: string; // CVSS v3.x
  accessVector?: string; // CVSS v2
}

interface MetricaNvd {
  cvssData: CvssDataNvd;
}

interface CveItemNvd {
  cve: {
    id: string;
    descriptions?: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV31?: MetricaNvd[];
      cvssMetricV30?: MetricaNvd[];
      cvssMetricV2?: MetricaNvd[];
    };
    weaknesses?: Array<{ description?: Array<{ lang: string; value: string }> }>;
  };
}

interface RespuestaNvd {
  vulnerabilities?: CveItemNvd[];
}

function primeraMetricaDisponible(metrics: CveItemNvd['cve']['metrics']): MetricaNvd | undefined {
  return metrics?.cvssMetricV31?.[0] ?? metrics?.cvssMetricV30?.[0] ?? metrics?.cvssMetricV2?.[0];
}

function esAccesoRemoto(cvssData: CvssDataNvd): boolean {
  const vector = cvssData.attackVector ?? cvssData.accessVector ?? '';
  return vector.toUpperCase() === 'NETWORK';
}

function descripcionEnIngles(descriptions?: Array<{ lang: string; value: string }>): string {
  return descriptions?.find((d) => d.lang === 'en')?.value ?? descriptions?.[0]?.value ?? '';
}

function cweDePrimeraDebilidad(weaknesses?: CveItemNvd['cve']['weaknesses']): string {
  const descripciones = weaknesses?.[0]?.description;
  return descripcionEnIngles(descripciones) || 'N/A';
}

export function parsearRespuestaNvd(json: unknown): { importables: FilaImportable[]; rechazadas: FilaRechazada[] } {
  const respuesta = json as RespuestaNvd;
  const items = respuesta.vulnerabilities ?? [];

  const importables: FilaImportable[] = [];
  const rechazadas: FilaRechazada[] = [];

  items.forEach((item, index) => {
    try {
      const cveId = item.cve.id;
      const metrica = primeraMetricaDisponible(item.cve.metrics);
      if (!metrica) {
        throw new Error(`${cveId}: sin métricas CVSS publicadas todavía`);
      }

      const cve = new IdentificadorCVE(cveId);
      const cvssScore = new CvssScore(metrica.cvssData.baseScore);
      const tipoAcceso = new TipoAccesoValue(esAccesoRemoto(metrica.cvssData) ? 'Remoto' : 'Local');
      const descripcion = descripcionEnIngles(item.cve.descriptions);
      const tipoVulnerabilidad = cweDePrimeraDebilidad(item.cve.weaknesses);

      const vulnerabilidad = new Vulnerabilidad(
        String(index + 1),
        cve,
        cvssScore,
        descripcion,
        tipoAcceso,
        undefined, // diasParaParche: NVD no publica una fecha de parche propia
        descripcion,
        tipoVulnerabilidad
      );

      importables.push({ vulnerabilidad, fuente: 'nvd-api' });
    } catch (error) {
      rechazadas.push({
        fila: index + 1,
        error: error instanceof Error ? error.message : 'Error desconocido',
        datos: { cve: item.cve?.id ?? 'desconocido' }
      });
    }
  });

  return { importables, rechazadas };
}
