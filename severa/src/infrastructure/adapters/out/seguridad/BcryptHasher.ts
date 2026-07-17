import bcrypt from 'bcrypt';
import { HasherDeContrasenas } from '../../../../application/ports/out/HasherDeContrasenas';

export class BcryptHasher implements HasherDeContrasenas {
  async generarHash(contrasena: string): Promise<string> {
    return bcrypt.hash(contrasena, 10);
  }

  async comparar(contrasena: string, hash: string): Promise<boolean> {
    return bcrypt.compare(contrasena, hash);
  }
}
