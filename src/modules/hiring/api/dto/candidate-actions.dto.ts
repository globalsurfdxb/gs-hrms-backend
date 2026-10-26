import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/* Small request bodies for candidate actions. */

export class ApplyToJobDto {
  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a10', description: 'An OPEN job' })
  @IsUUID()
  jobId: string;
}

export class CandidateTagsDto {
  @ApiProperty({ example: ['Shortlisted', 'Fortinet NSE4'], description: 'The whole list; at most 20' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags: string[];
}

export class CandidateNoteDto {
  @ApiProperty({ example: 'Asked for 45 days notice; open to Kochi.' })
  @IsString()
  @Length(1, 2000)
  text: string;
}
