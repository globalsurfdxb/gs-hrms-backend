import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

/* The id is not sent: the server makes a readable one from the city or name (BR-ORG-011). `system` is never
   accepted — only seeded locations are built-in. */
export class CreateLocationDto {
  @ApiProperty({ example: 'Saudi Arabia', description: 'Unique, ignoring case' })
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional({ example: 'Riyadh', description: 'Also used to make the id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiProperty({ example: 'SAR', description: 'ISO 4217 code; stored upper-case' })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({ example: 'Asia/Riyadh', description: 'IANA timezone — leave and attendance days use it' })
  @IsString()
  @MaxLength(64)
  timezone: string;

  @ApiProperty({ example: '+966', description: '"+" and 1–4 digits; spaces are removed' })
  @IsString()
  @MaxLength(10)
  phoneCode: string;

  @ApiProperty({ example: 9, description: 'Digits in a local phone number, 6–15' })
  @IsInt()
  @Min(6)
  @Max(15)
  phoneDigits: number;

  @ApiPropertyOptional({ example: '50 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneExample?: string;

  @ApiPropertyOptional({ example: '09:00 – 18:00, Sun–Thu' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workingHours?: string;

  @ApiPropertyOptional({
    example: ['Olaya Tower, Riyadh'],
    description: 'Seats employees can be given; unique ignoring case',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  seating?: string[];

  @ApiProperty({
    enum: ['UAE', 'INDIA'],
    example: 'UAE',
    description: 'Employee form rules: UAE (visa, Emirates ID, WPS) or INDIA (Aadhaar, PAN, PF)',
  })
  @IsIn(['UAE', 'INDIA'])
  template: 'UAE' | 'INDIA';
}
