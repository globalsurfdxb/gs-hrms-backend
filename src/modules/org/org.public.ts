/* The ONLY file other modules may import from org (enforced by `npm run lint:arch`).
   Export the module, read services and response types — never repositories, domain internals or DTO classes
   meant for this module's own controllers. */
export { OrgModule } from './org.module.js';
export { CompaniesService } from './application/companies.service.js';
export type { CompanyResponse } from './api/dto/company.response.js';
export { LocationsService } from './application/locations.service.js';
export type { LocationResponse } from './api/dto/location.response.js';
