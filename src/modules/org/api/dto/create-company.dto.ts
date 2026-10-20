import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'GS Digital' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiProperty({ example: 'GSD', description: '2–8 letters or digits; stored upper-case' })
  @IsString()
  @Length(2, 8)
  shortCode: string;

  @ApiPropertyOptional({ example: 'Digital marketing and software solutions.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'www.gsdigital.ae' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiProperty({ example: 'Dubai', description: 'A location id, or "Both" for every location' })
  @IsString()
  @MaxLength(40)
  location: string;

  @ApiPropertyOptional({ example: '2019' })
  @IsOptional()
  @Matches(/^\d{4}$/)
  established?: string;
}
