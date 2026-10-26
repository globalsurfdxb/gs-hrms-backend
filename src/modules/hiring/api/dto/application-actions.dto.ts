import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { EXITS, MOVABLE_STAGES, REJECTION_REASONS } from '../../domain/application.rules.js';

/* Pipeline actions (BR-HIR-009). */

export class MoveApplicationDto {
  @ApiProperty({ enum: MOVABLE_STAGES, example: 'TECHNICAL_INTERVIEW', description: 'HIRED only by an accepted offer' })
  @IsIn(MOVABLE_STAGES)
  stage: (typeof MOVABLE_STAGES)[number];

  @ApiPropertyOptional({ example: 'Strong screening call' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ExitApplicationDto {
  @ApiProperty({ enum: EXITS, example: 'REJECTED' })
  @IsIn(EXITS)
  exit: (typeof EXITS)[number];

  @ApiPropertyOptional({
    example: 'Skills mismatch',
    description: `REJECTED: one of ${REJECTION_REASONS.map((r) => `"${r}"`).join(', ')}. Free text otherwise.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({ example: 'No SD-WAN experience' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
