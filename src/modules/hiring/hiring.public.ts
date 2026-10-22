/* The ONLY file other modules may import from hiring (enforced by `npm run lint:arch`).
   Export the module, read services and response types — never repositories, domain internals or DTO classes
   meant for this module's own controllers. */
export { HiringModule } from './hiring.module.js';
