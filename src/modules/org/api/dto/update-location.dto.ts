import { PartialType } from '@nestjs/swagger';
import { CreateLocationDto } from './create-location.dto.js';

/* The id never changes. A built-in location's template cannot change (BR-ORG-010). */
export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
