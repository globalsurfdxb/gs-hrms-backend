/* The full permission catalogue: Module → Category → Feature, ported from the frontend (gs-hrms lib/access.ts
   `buildCatalog()`, with the tab and hub lists from lib/nav.ts). Feature ids and default grants MUST stay identical
   to the frontend — permission-catalog.spec.ts compares them with a snapshot taken from the frontend
   (test/fixtures/frontend-permissions.json). When the frontend catalogue changes, port the change here and refresh
   the snapshot (see the fixture's README).
   Pure file — no Nest imports, because the seed script uses it too. */

export type ExtraAction = 'add' | 'edit' | 'delete';
export type SystemRole = 'Super Admin' | 'HR' | 'Office Admin' | 'Team Lead' | 'Employee';

export interface CatalogFeature {
  id: string;
  label: string;
  /** Actions beyond View that make sense here. Empty = a read-only screen. */
  actions: ExtraAction[];
}

export interface CatalogCategory {
  id: string;
  label: string;
  /** Lowest built-in role rank that gets this category by default (1 Employee … 5 Super Admin). */
  rank: number;
  features: CatalogFeature[];
}

export interface CatalogModule {
  id: string;
  name: string;
  categories: CatalogCategory[];
}

export const SYSTEM_ROLES: SystemRole[] = ['Super Admin', 'HR', 'Office Admin', 'Team Lead', 'Employee'];
const RANK: Record<SystemRole, number> = { Employee: 1, 'Team Lead': 2, 'Office Admin': 3, HR: 4, 'Super Admin': 5 };

/** Frontend `PERS`: the app areas and Home scopes each built-in role sees. */
const PERSONA: Record<SystemRole, { areas: string[]; scopes: string[] }> = {
  Employee: { areas: ['home'], scopes: ['my'] },
  'Team Lead': { areas: ['home'], scopes: ['my', 'team'] },
  HR: { areas: ['home', 'operations', 'reports', 'administration'], scopes: ['my', 'org'] },
  'Office Admin': { areas: ['home', 'operations', 'reports', 'administration'], scopes: ['my', 'org'] },
  'Super Admin': { areas: ['home', 'operations', 'reports', 'administration'], scopes: ['my', 'team', 'org'] },
};

/** Read-only screens, recognised by their label (frontend `READ_ONLY`).
    Copied as the frontend has it: there the `log` alternative is followed by an invisible backspace character
    (U+0008, written `\u0008` here), so it never matches and "Reminder log" gets Add/Edit/Delete. It was probably
    meant as `log\b`. Fix it in the frontend first, then here, then refresh test/fixtures/frontend-permissions.json. */
const READ_ONLY =
  // eslint-disable-next-line no-control-regex -- deliberate copy of the frontend pattern, see above
  /overview|dashboard|calendar|summary|report|analytic|audit|log\u0008|payslips|reportees|ex-employees|new hires|notification/i;

type Item = [key: string, label: string];

/** Frontend `HOME_TABS`. */
const HOME_TABS: Record<'my' | 'team' | 'org', Item[]> = {
  my: [
    ['overview', 'Overview'],
    ['profile', 'My Profile'],
    ['leave', 'Leave & Attendance'],
    ['requests', 'Requests'],
    ['interviews', 'My Interviews'],
    ['referrals', 'Referrals'],
    ['files', 'Files'],
    ['assets', 'Assets'],
    ['expiry', 'Expiry'],
    ['payslips', 'Payslips'],
    ['notifications', 'Notifications'],
  ],
  team: [
    ['directory', 'Directory'],
    ['attendance', 'Attendance'],
    ['leave', 'Leave'],
    ['visa', 'Visa'],
    ['separation', 'Separation'],
    ['expiry', 'Expiry'],
    ['performance', 'Performance'],
    ['notifications', 'Notifications'],
  ],
  org: [
    ['overview', 'Overview'],
    ['directory', 'Directory'],
    ['orgstructure', 'Org Structure'],
    ['files', 'Files'],
    ['requests', 'Requests'],
  ],
};

/** Frontend `OPS` (Operations hub). */
const OPS: [section: string, items: Item[]][] = [
  [
    'Employee Lifecycle',
    [
      ['directory', 'Employee Directory'],
      ['onboarding', 'Onboarding'],
      ['offboarding', 'Offboarding'],
      ['performance', 'Performance Management'],
      ['learning', 'Learning & Development'],
    ],
  ],
  [
    'Documents & Compliance',
    [
      ['visa', 'Visa Management'],
      ['expiry', 'Employee Expiry'],
    ],
  ],
  [
    'Expense Claims',
    [
      ['exp-dashboard', 'Expense Dashboard'],
      ['exp-claims', 'All Claims'],
      ['exp-new', 'New Claim'],
      ['exp-approvals', 'Approvals'],
      ['exp-cats', 'Categories & Policy'],
    ],
  ],
];

/** Frontend `ADMIN` (Administration hub). */
const ADMIN: [section: string, items: Item[]][] = [
  [
    'Organization',
    [
      ['admin-companies', 'Companies'],
      ['admin-structure', 'Departments & Designations'],
    ],
  ],
  [
    'Access & Automation',
    [
      ['admin-roles', 'Roles & Permissions'],
      ['admin-workflow', 'Workflow Settings'],
      ['admin-notif', 'Notification Rules'],
      ['admin-reminders', 'Reminders'],
    ],
  ],
  [
    'System',
    [
      ['admin-audit', 'Audit Logs'],
      ['admin-settings', 'System Settings'],
    ],
  ],
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const feature = (id: string, label: string): CatalogFeature => ({
  id,
  label,
  actions: READ_ONLY.test(label) ? [] : ['add', 'edit', 'delete'],
});

const cat = (module: string, id: string, label: string, rank: number, labels: string[]): CatalogCategory => ({
  id,
  label,
  rank,
  features: labels.map((l) => feature(`${module}:${id}:${slug(l)}`, l)),
});

function buildCatalog(): CatalogModule[] {
  const admin: CatalogModule = {
    id: 'administration',
    name: 'Administration',
    categories: ADMIN.map(([section, items]) => ({
      id: `admin-${slug(section)}`,
      label: section,
      rank: 5,
      features: items.map(([key, label]) => feature(`administration:${key}`, label)),
    })),
  };
  const employee: CatalogModule = {
    id: 'employee',
    name: 'Employee Management',
    categories: [
      ...(['my', 'team', 'org'] as const).map((scope, i) => ({
        id: scope,
        label: { my: 'My Space', team: 'Team', org: 'Organization' }[scope],
        rank: i + 1,
        features: HOME_TABS[scope].map(([key, label]) => feature(`employee:${scope}:${key}`, label)),
      })),
      ...OPS.map(([section, items]) => ({
        id: `ops-${slug(section)}`,
        label: `Operations · ${section}`,
        rank: 4,
        features: items.map(([key, label]) => feature(`employee:ops:${key}`, label)),
      })),
      cat('employee', 'reports', 'Reports', 4, ['Reports & analytics']),
    ],
  };
  const hiring: CatalogModule = {
    id: 'hiring',
    name: 'Hiring Management',
    categories: [
      cat('hiring', 'requisitions', 'Requisitions', 2, ['Requisitions', 'Requisition approvals']),
      cat('hiring', 'recruiting', 'Recruiting', 4, ['Jobs', 'Candidates', 'Interviews', 'Offers']),
      cat('hiring', 'reports', 'Reports', 4, ['Hiring reports']),
    ],
  };
  const leave: CatalogModule = {
    id: 'leave-attendance',
    name: 'Leave & Attendance Management',
    categories: [
      cat('leave', 'my-space', 'My Space', 1, ['Overview & check-in', 'Dashboard', 'Calendar']),
      cat('leave', 'leave', 'Leave Tracker', 1, [
        'Leave summary',
        'Leave requests',
        'Compensatory request',
        'Holiday calendar',
      ]),
      cat('leave', 'attendance', 'Attendance', 1, ['Attendance summary', 'Regularization requests']),
      cat('leave', 'team', 'Team', 2, [
        'Reportees',
        'Approvals',
        'Team attendance',
        'Team leave calendar',
        'Ex-employees',
      ]),
      cat('leave', 'org', 'Organization', 3, ['Organization overview', 'Announcements', 'Policies', 'New hires']),
      cat('leave', 'reports', 'Reports', 2, ['Reports & analytics']),
      cat('leave', 'ops-attendance', 'Operations · Attendance', 4, [
        'Attendance processing',
        'Exceptions',
        'Attendance statuses',
        'Shift master',
        'Ramadan schedule',
      ]),
      cat('leave', 'ops-leave', 'Operations · Leave', 4, [
        'Leave types',
        'Document verification',
        'Balance adjustment',
        'Carry forward',
        'Encashment',
        'Maternity / parental',
        'Holiday settings',
      ]),
      cat('leave', 'ops-compliance', 'Operations · Compliance', 4, [
        'Occurrences',
        'Discipline cases',
        'Approval workflows',
      ]),
      cat('leave', 'ops-payroll', 'Operations · Payroll & Output', 4, [
        'Overtime & comp-off',
        'Finalize & lock',
        'Payroll export',
        'Audit logs',
      ]),
      cat('leave', 'ops-config', 'Operations · Configuration', 4, ['Policy settings']),
      cat('leave', 'ops-admin', 'Operations · Administration', 5, [
        'Companies & branches',
        'Biometric devices',
        'API & integrations',
        'System audit',
      ]),
    ],
  };
  const asset: CatalogModule = {
    id: 'asset-management',
    name: 'Asset Management',
    categories: [
      cat('asset', 'register', 'Register & assignment', 3, [
        'Asset register',
        'Assign & return',
        'Warranty & AMC tracking',
      ]),
      cat('asset', 'reports', 'Reports', 3, ['Asset reports']),
    ],
  };
  const payroll: CatalogModule = {
    id: 'payroll',
    name: 'Payroll Management',
    categories: [
      cat('payroll', 'self', 'Self service', 1, ['My payslips']),
      cat('payroll', 'processing', 'Payroll processing', 4, [
        'Payroll runs',
        'Salary structure',
        'Payslip distribution',
      ]),
      cat('payroll', 'reports', 'Reports', 4, ['Payroll reports']),
    ],
  };
  const renewals: CatalogModule = {
    id: 'renewals',
    name: 'Renewal Management',
    categories: [
      cat('renewals', 'employee', 'Employee renewals', 4, [
        'Visa renewals',
        'Emirates ID renewals',
        'Passport & other documents',
      ]),
      cat('renewals', 'business', 'Business renewals', 5, [
        'Trade licence',
        'Insurance policies',
        'Contracts & subscriptions',
      ]),
      cat('renewals', 'reminders', 'Reminders', 4, ['Reminder rules', 'Reminder log']),
    ],
  };
  return [admin, employee, hiring, leave, asset, payroll, renewals];
}

export const CATALOG: readonly CatalogModule[] = buildCatalog();

/** Whether a built-in role sees a category by default (frontend `defaultGrants`). */
function seesCategory(role: SystemRole, m: CatalogModule, c: CatalogCategory): boolean {
  const p = PERSONA[role];
  if (m.id === 'employee') {
    if (c.id === 'my' || c.id === 'team' || c.id === 'org') return p.scopes.includes(c.id);
    return p.areas.includes(c.id === 'reports' ? 'reports' : 'operations');
  }
  if (m.id === 'administration') return p.areas.includes('administration');
  return RANK[role] >= c.rank;
}

/** Extra actions a built-in role gets by default on a feature it sees (frontend `defaultActions`). */
function defaultActions(role: SystemRole, m: CatalogModule, c: CatalogCategory, f: CatalogFeature): ExtraAction[] {
  const have = f.actions;
  if (role === 'Super Admin') return have;
  if (role === 'HR') return m.id === 'administration' ? have.filter((a) => a !== 'delete') : have;
  if (role === 'Office Admin') return have.filter((a) => a !== 'delete');
  if (c.rank <= 2) return have.filter((a) => (role === 'Team Lead' ? a !== 'delete' : a === 'add'));
  return [];
}

/** Starting grants for a built-in role, as permission keys (`<id>` = View, `<id>#add|edit|delete`). */
export function catalogDefaultGrants(role: SystemRole): string[] {
  return CATALOG.flatMap((m) =>
    m.categories.flatMap((c) =>
      seesCategory(role, m, c)
        ? c.features.flatMap((f) => [f.id, ...defaultActions(role, m, c, f).map((a) => `${f.id}#${a}`)])
        : [],
    ),
  );
}
