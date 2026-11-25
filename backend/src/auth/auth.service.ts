import { BadRequestException, ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  async onModuleInit() {
    const username = this.config.get<string>('BOOTSTRAP_ADMIN_USERNAME');
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    if (!username || !password) return;
    if (password.length < 14) throw new Error('BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 14 caracteres.');
    const found = await this.db.query('SELECT id_usuario FROM dbo.usuarios_sistema WHERE nombre_usuario=@username', { username });
    if (found.length) return;
    const salt = randomBytes(32);
    const hash = scryptSync(password, salt, 64);
    await this.db.query(
      `INSERT dbo.usuarios_sistema(nombre_usuario,hash_credencial,sal_credencial,rol)
       VALUES(@username,@hash,@salt,N'ADMIN')`,
      { username, hash, salt },
    );
  }

  async login(username: string, password: string) {
    const rows = await this.db.query<any>(
      `SELECT id_usuario,id_estudiante,nombre_usuario,hash_credencial,sal_credencial,rol
       FROM dbo.usuarios_sistema WHERE nombre_usuario=@username AND activo=1`,
      { username: username.trim() },
    );
    if (!rows.length) throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    const user = rows[0];
    const candidate = scryptSync(password, user.sal_credencial, 64);
    if (!timingSafeEqual(candidate, user.hash_credencial)) throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest();
    const id = randomUUID();
    await this.db.query(
      `INSERT dbo.sesiones_autenticacion(id_sesion,id_usuario,hash_token,creado_en,expira_en)
       VALUES(@id,@userId,@hash,SYSDATETIMEOFFSET(),DATEADD(HOUR,8,SYSDATETIMEOFFSET()))`,
      { id, userId: user.id_usuario, hash },
    );
    return { token, csrfToken, user: this.publicUser(user) };
  }

  async authenticate(token?: string) {
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar.');
    const hash = createHash('sha256').update(token).digest();
    const rows = await this.db.query<any>(
      `SELECT TOP 1 u.id_usuario,u.id_estudiante,u.nombre_usuario,u.rol,s.id_sesion
       FROM dbo.sesiones_autenticacion s JOIN dbo.usuarios_sistema u ON u.id_usuario=s.id_usuario
       WHERE s.hash_token=@hash AND s.revocado_en IS NULL AND s.expira_en>SYSDATETIMEOFFSET() AND u.activo=1`,
      { hash },
    );
    if (!rows.length) throw new UnauthorizedException('La sesión expiró. Inicia sesión nuevamente.');
    return rows[0];
  }

  async logout(token?: string) {
    if (token) {
      const hash = createHash('sha256').update(token).digest();
      await this.db.query(
        'UPDATE dbo.sesiones_autenticacion SET revocado_en=SYSDATETIMEOFFSET() WHERE hash_token=@hash AND revocado_en IS NULL',
        { hash },
      );
    }
  }

  async createUser(input: { username: string; password: string; role: string; studentId?: number }) {
    if (input.password.length < 14) throw new BadRequestException('La contraseña debe tener al menos 14 caracteres.');
    const allowed = ['ESTUDIANTE', 'COORDINACION', 'EVALUACION', 'DIRECCION', 'ADMIN'];
    if (!allowed.includes(input.role)) throw new BadRequestException('Rol no permitido.');
    if (input.role === 'ESTUDIANTE' && !input.studentId) throw new BadRequestException('El rol ESTUDIANTE requiere id_estudiante.');
    if (input.role !== 'ESTUDIANTE' && input.studentId) throw new BadRequestException('Solo una cuenta ESTUDIANTE se vincula con un estudiante.');
    const username = input.username.trim();
    if (!username) throw new BadRequestException('El nombre de usuario no puede estar vacío.');
    const exists = await this.db.query('SELECT TOP 1 id_usuario FROM dbo.usuarios_sistema WHERE nombre_usuario=@username', { username });
    if (exists.length) throw new ConflictException('Ese nombre de usuario ya está ocupado.');
    if (input.studentId) {
      const student = await this.db.query('SELECT TOP 1 id_estudiante FROM dbo.estudiantes WHERE id_estudiante=@studentId', { studentId: input.studentId });
      if (!student.length) throw new BadRequestException('El estudiante seleccionado no existe.');
    }
    const salt = randomBytes(32);
    const hash = scryptSync(input.password, salt, 64);
    await this.db.query(
      `INSERT dbo.usuarios_sistema(id_estudiante,nombre_usuario,hash_credencial,sal_credencial,rol)
       VALUES(@studentId,@username,@hash,@salt,@role)`,
      { studentId: input.studentId ?? null, username, hash, salt, role: input.role },
    );
    return { ok: true };
  }

  async getStudentsReadyForAccount() {
    return this.db.query(
      `SELECT e.id_estudiante,e.codigo_estudiante,e.nombres,e.apellidos,e.correo_institucional,e.carrera,COUNT_BIG(op.id_oportunidad) AS evaluaciones_disponibles
       FROM dbo.estudiantes e
       JOIN dbo.oportunidades_evaluacion op ON op.id_estudiante=e.id_estudiante AND op.aplicable=1 AND op.id_version_instrumento IS NOT NULL
       JOIN dbo.instrumento_versiones iv ON iv.id_version_instrumento=op.id_version_instrumento AND iv.estado_contenido=N'PUBLICADO'
       LEFT JOIN dbo.resultados_evaluacion r ON r.id_oportunidad=op.id_oportunidad AND r.es_vigente=1 AND r.estado_validez=N'VALIDO'
       LEFT JOIN dbo.usuarios_sistema u ON u.id_estudiante=e.id_estudiante
       WHERE u.id_usuario IS NULL AND r.id_resultado IS NULL
       GROUP BY e.id_estudiante,e.codigo_estudiante,e.nombres,e.apellidos,e.correo_institucional,e.carrera
       ORDER BY e.codigo_estudiante`,
    );
  }

  private publicUser(user: any) {
    return { id_usuario: user.id_usuario, id_estudiante: user.id_estudiante, nombre_usuario: user.nombre_usuario, rol: user.rol };
  }
}
