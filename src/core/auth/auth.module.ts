import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OriginGuard } from './guards/origin.guard.js';
import { SessionGuard } from './guards/session.guard.js';
import { IdentityRepository } from './identity.repository.js';
import { EntraProvider } from './providers/entra.provider.js';
import { SessionRepository } from './session/session.repository.js';
import { SessionService } from './session/session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    EntraProvider,
    IdentityRepository,
    SessionRepository,
    SessionService,
    SessionGuard,
    OriginGuard,
  ],
  exports: [SessionService, SessionGuard, OriginGuard],
})
export class AuthModule {}
