import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateRequisitionDto } from './create-requisition.dto.js';

/** Send only the fields that change. Allowed while DRAFT or REJECTED. */
export class UpdateRequisitionDto extends PartialType(OmitType(CreateRequisitionDto, ['submit'] as const)) {}
