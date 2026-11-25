import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public, Roles } from './auth.guard';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() @MinLength(1) @MaxLength(100) username: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}
class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(100) username: string;
  @IsString() @MinLength(14) @MaxLength(200) password: string;
  @IsIn(['ESTUDIANTE', 'COORDINACION', 'EVALUACION', 'DIRECCION', 'ADMIN']) role: string;
  @IsOptional() @IsInt() studentId?: number;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Roles('ADMIN')
  @Get('students-ready-for-account')
  studentsReadyForAccount() {
    return this.auth.getStudentsReadyForAccount();
  }

  @Roles('ADMIN')
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.auth.createUser({ username: dto.username, password: dto.password, role: dto.role, studentId: dto.studentId });
  }
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: any) {
    const { token, csrfToken, user } = await this.auth.login(dto.username, dto.password);
    const cookieOptions = { sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60 * 1000 };
    response.cookie('mmet_session', token, { ...cookieOptions, httpOnly: true });
    response.cookie('mmet_csrf', csrfToken, { ...cookieOptions, httpOnly: false });
    return { user };
  }

  @Post('logout')
  async logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
    await this.auth.logout(request.sessionToken);
    response.clearCookie('mmet_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    response.clearCookie('mmet_csrf', { sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() request: any) {
    if (!request.user) throw new UnauthorizedException();
    const { id_usuario, id_estudiante, nombre_usuario, rol } = request.user;
    return { id_usuario, id_estudiante, nombre_usuario, rol };
  }
}
