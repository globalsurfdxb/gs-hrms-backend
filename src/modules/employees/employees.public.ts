/* The ONLY file other modules may import from employees (enforced by `npm run lint:arch`).
   Export the module, read services and response types — never repositories or domain internals. */
export { EmployeesModule } from './employees.module.js';
export { EmployeesService } from './application/employees.service.js';
export type { EmployeeResponse } from './api/dto/employee.response.js';
