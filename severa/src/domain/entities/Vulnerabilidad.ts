import { CvssScore } from '../value-objects/CvssScore';
import { IdentificadorCVE } from '../value-objects/IdentificadorCVE';
import { TipoAccesoValue } from '../value-objects/TipoAcceso';
import { EstadoRemediacion, EstadoRemediacionValue } from '../value-objects/EstadoRemediacion';

export class Vulnerabilidad {
  public readonly software: string;
  public readonly tipoVulnerabilidad: string;
  public readonly estadoRemediacion: EstadoRemediacionValue;
  public readonly fechaCarga: Date;
  public readonly fechaRemediacion?: Date;

  constructor(
    public readonly id: string,
    public readonly cve: IdentificadorCVE,
    public readonly cvssScore: CvssScore,
    public readonly descripcion: string,
    public readonly tipoAcceso?: TipoAccesoValue,
    public readonly diasParaParche?: number,
    software?: string,
    tipoVulnerabilidad?: string,
    estadoRemediacion?: EstadoRemediacionValue,
    fechaCarga?: Date,
    fechaRemediacion?: Date
  ) {
    this.software = software ?? descripcion;
    this.tipoVulnerabilidad = tipoVulnerabilidad ?? 'N/A';
    this.estadoRemediacion = estadoRemediacion ?? new EstadoRemediacionValue('Pendiente');
    this.fechaCarga = fechaCarga ?? new Date();
    this.fechaRemediacion = fechaRemediacion;
  }

  // RF-74/RF-75: aplica la regla de transición de EstadoRemediacionValue y
  // devuelve una nueva Vulnerabilidad (la entidad es inmutable). Registra la
  // fecha de remediación cuando el nuevo estado es "Remediada" (RF-75).
  transicionarEstado(nuevoEstado: EstadoRemediacion): Vulnerabilidad {
    const estadoActualizado = this.estadoRemediacion.transicionarA(nuevoEstado);
    const fechaRemediacion = nuevoEstado === 'Remediada' ? new Date() : this.fechaRemediacion;

    return new Vulnerabilidad(
      this.id,
      this.cve,
      this.cvssScore,
      this.descripcion,
      this.tipoAcceso,
      this.diasParaParche,
      this.software,
      this.tipoVulnerabilidad,
      estadoActualizado,
      this.fechaCarga,
      fechaRemediacion
    );
  }
}
