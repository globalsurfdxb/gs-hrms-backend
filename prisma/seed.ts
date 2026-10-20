import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { defaultGrants } from '../src/core/iam/permission-catalog.js';

/* Development seed — FICTIONAL data only. One persona per system role, matching the frontend persona codes
   (lib/data.ts PERSONAS) so the dev login mirrors the frontend's persona switcher.
   Never seed or restore real employee data outside production. Idempotent: safe to run repeatedly. */

if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed a production database');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }) });

const ROLES = [
  { name: 'Super Admin', description: 'Every module' },
  { name: 'HR', description: 'Directory, onboarding, offboarding, visa, documents, requests' },
  { name: 'Office Admin', description: 'Org structure, files, requests, document expiry' },
  { name: 'Team Lead', description: 'Own workspace and direct reports' },
  { name: 'Employee', description: 'Own workspace only' },
];

const LOCATIONS = [
  {
    id: 'Dubai',
    name: 'United Arab Emirates',
    city: 'Dubai',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    phoneCode: '+971',
    phoneDigits: 9,
    phoneExample: '50 123 4567',
    workingHours: '09:00 – 18:00, Mon–Fri',
    seating: ['901, SIT Tower, Dubai', '703, SIT Tower, Dubai', 'Warehouse Office, Dubai'],
    template: 'UAE' as const,
    system: true,
  },
  {
    id: 'Kochi',
    name: 'India',
    city: 'Kochi',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    phoneCode: '+91',
    phoneDigits: 10,
    phoneExample: '98765 43210',
    workingHours: '09:30 – 18:30, Mon–Fri',
    seating: ['Kochi Office - Onsite', 'Kochi Office - WFH'],
    template: 'INDIA' as const,
    system: true,
  },
];

const COMPANIES = [
  {
    shortCode: 'GSIT',
    name: 'GS IT',
    locationId: null,
    established: '2015',
    website: 'www.gs-it.ae',
    description: 'Parent entity.',
  },
  {
    shortCode: 'GSD',
    name: 'GS Digital',
    locationId: 'Dubai',
    established: '2019',
    website: 'www.gsdigital.ae',
    description: '',
  },
  {
    shortCode: 'GSAV',
    name: 'GS AV',
    locationId: 'Dubai',
    established: '2017',
    website: 'www.gsav.ae',
    description: '',
  },
  {
    shortCode: 'GSS',
    name: 'GS Security',
    locationId: null,
    established: '2021',
    website: 'www.gssecurity.ae',
    description: '',
  },
];

/** [company, department, locations, designations] */
const STRUCTURE: [string, string, string[], string[]][] = [
  ['GSIT', 'Management & Administration', ['Dubai', 'Kochi'], ['General Manager']],
  ['GSIT', 'HR', ['Dubai', 'Kochi'], ['HR Executive']],
  ['GSIT', 'Cloud & Infra', ['Dubai'], ['Solutions Architect']],
  ['GSIT', 'Procurement', ['Dubai'], ['Procurement Officer']],
  ['GSD', 'Sales', ['Dubai'], ['Account Manager']],
];

/** Fictional people. Codes and roles match the frontend personas; names and emails do not belong to anyone. */
const PEOPLE = [
  {
    code: 'GS-120',
    name: 'Dev Super Admin',
    role: 'Super Admin',
    co: 'GSIT',
    dept: 'Management & Administration',
    title: 'General Manager',
    manager: null,
  },
  { code: 'GS-119', name: 'Dev HR', role: 'HR', co: 'GSIT', dept: 'HR', title: 'HR Executive', manager: 'GS-120' },
  {
    code: 'GS-101',
    name: 'Dev Office Admin',
    role: 'Office Admin',
    co: 'GSIT',
    dept: 'Procurement',
    title: 'Procurement Officer',
    manager: 'GS-120',
  },
  {
    code: 'GS-058',
    name: 'Dev Team Lead',
    role: 'Team Lead',
    co: 'GSIT',
    dept: 'Cloud & Infra',
    title: 'Solutions Architect',
    manager: 'GS-120',
  },
  {
    code: 'GS-087',
    name: 'Dev Employee',
    role: 'Employee',
    co: 'GSD',
    dept: 'Sales',
    title: 'Account Manager',
    manager: 'GS-058',
  },
];

async function main() {
  const roleIds = new Map<string, string>();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({ where: { name: r.name }, update: {}, create: { ...r, system: true } });
    roleIds.set(r.name, role.id);
    const keys = defaultGrants(r.name);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (keys.length) await prisma.rolePermission.createMany({ data: keys.map((key) => ({ roleId: role.id, key })) });
  }

  for (const l of LOCATIONS) await prisma.location.upsert({ where: { id: l.id }, update: l, create: l });

  const companyIds = new Map<string, string>();
  for (const c of COMPANIES) {
    const company = await prisma.company.upsert({ where: { shortCode: c.shortCode }, update: c, create: c });
    companyIds.set(c.shortCode, company.id);
  }

  const designationIds = new Map<string, { departmentId: string; designationId: string }>();
  for (const [co, name, locations, titles] of STRUCTURE) {
    const companyId = companyIds.get(co)!;
    const dept = await prisma.department.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: { companyId, name, locations: { create: locations.map((locationId) => ({ locationId })) } },
    });
    for (const title of titles) {
      const d = await prisma.designation.upsert({
        where: { departmentId_title: { departmentId: dept.id, title } },
        update: {},
        create: { departmentId: dept.id, title },
      });
      designationIds.set(`${co}/${name}/${title}`, { departmentId: dept.id, designationId: d.id });
    }
  }

  const employeeIds = new Map<string, string>();
  for (const p of PEOPLE) {
    const place = designationIds.get(`${p.co}/${p.dept}/${p.title}`)!;
    const data = {
      fullName: p.name,
      email: `${p.code.toLowerCase()}@hrms.local`,
      locationId: 'Dubai',
      companyId: companyIds.get(p.co)!,
      departmentId: place.departmentId,
      designationId: place.designationId,
      roleId: roleIds.get(p.role)!,
      reportingManagerId: p.manager ? employeeIds.get(p.manager)! : null,
      employmentStatus: 'ACTIVE' as const,
      employmentType: 'PERMANENT' as const,
      dateOfJoining: new Date('2022-01-10'),
    };
    const e = await prisma.employee.upsert({
      where: { employeeCode: p.code },
      update: data,
      create: { employeeCode: p.code, ...data },
    });
    employeeIds.set(p.code, e.id);
  }

  console.log(
    `Seeded ${ROLES.length} roles, ${LOCATIONS.length} locations, ${COMPANIES.length} companies, ${PEOPLE.length} personas.`,
  );
}

await main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
