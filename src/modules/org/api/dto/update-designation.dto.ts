import { PickType } from '@nestjs/swagger';
import { CreateDesignationDto } from './create-designation.dto.js';

/* Only the title changes. Moving a designation to another department would break the employees who hold it. */
export class UpdateDesignationDto extends PickType(CreateDesignationDto, ['title']) {}
