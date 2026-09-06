export interface HasherDeContrasenas {
  generarHash(contrasena: string): Promise<string>;
  comparar(contrasena: string, hash: string): Promise<boolean>;
}
