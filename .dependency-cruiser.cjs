/* Architecture rules — `npm run lint:arch`. These keep the modular monolith modular as the team grows.
   Do not relax a rule to make a change pass; restructure the change (see docs/architecture.md). */
module.exports = {
  forbidden: [
    {
      name: 'module-internals',
      comment: 'Another module may only be imported through its <name>.public.ts file.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/[^/]+\\.public\\.ts$'] },
    },
    {
      name: 'core-is-independent',
      comment: 'core/ and shared/ are used by modules — they never depend on a business module.',
      severity: 'error',
      from: { path: '^src/(core|shared)/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'shared-is-leaf',
      comment: 'shared/ holds pure helpers; it must not depend on core/ (Nest wiring).',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/core/' },
    },
    {
      name: 'database-only-in-infrastructure',
      comment: 'In modules, only infrastructure/ (repositories) may touch Prisma or the generated client at runtime.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(api|application|domain)/' },
      to: { path: '^src/(core/database/|generated/)', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain/ is plain TypeScript business rules: no Nest, no HTTP, no persistence.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^(node_modules/@nestjs|src/core/|src/generated/)|/(api|application|infrastructure)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^src/generated/|\\.spec\\.ts$)' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
