import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service.js';
import { ApiErrors } from '../http/api-docs.js';
import { Public } from '../iam/access.decorators.js';

/* Azure App Service health check probes /api/health/ready. Responses never include versions or internals. */
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness', description: 'Public. The process is running.' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  @ApiErrors(500)
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness',
    description: 'Public. The database is reachable. Used by Azure health checks.',
  })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  @ApiServiceUnavailableResponse({ description: 'Database not reachable' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
