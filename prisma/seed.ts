import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { defaultGrants } from '../src/core/iam/permission-catalog.js';
import { FieldCipher } from '../src/shared/crypto/field-cipher.js';

/* Development seed — FICTIONAL data only. One persona per system role, matching the frontend persona codes
   (lib/data.ts PERSONAS) so the dev login mirrors the frontend's persona switcher.
   Never seed or restore real employee data outside production. Idempotent: safe to run repeatedly. */

if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed a production database');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }) });
/** Same keys as the app (env FIELD_ENCRYPTION_KEY / FIELD_BLIND_INDEX_KEY, base64), so the API can decrypt seeds. */
const cipher = new FieldCipher(
  Buffer.from(process.env['FIELD_ENCRYPTION_KEY'] ?? '', 'base64'),
  Buffer.from(process.env['FIELD_BLIND_INDEX_KEY'] ?? '', 'base64'),
);

const ROLES = [
  { name: 'Super Admin', description: 'Every module' },
  { name: 'HR', description: 'Directory, onboarding, offboarding, visa, documents, requests' },
  { name: 'Office Admin', description: 'Org structure, files, requests, document expiry' },
  {
    name: 'Talent Acquisition Manager',
    description: 'Hiring Management in full (chooses the recruiter for new jobs), own workspace and direct reports',
  },
  { name: 'Team Lead', description: 'Own workspace and direct reports' },
  { name: 'Recruiter', description: 'Recruiting for the jobs assigned to them, and own workspace' },
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
    description: 'Managed IT services, cloud infrastructure and network engineering — the parent entity.',
  },
  {
    shortCode: 'GSD',
    name: 'GS Digital',
    locationId: 'Dubai',
    established: '2019',
    website: 'www.gsdigital.ae',
    description: 'Digital marketing, e-commerce platforms and software solutions.',
  },
  {
    shortCode: 'GSAV',
    name: 'GS AV',
    locationId: 'Dubai',
    established: '2017',
    website: 'www.gsav.ae',
    description: 'Audio-visual systems integration and event technology.',
  },
  {
    shortCode: 'GSS',
    name: 'GS Security',
    locationId: null,
    established: '2021',
    website: 'www.gssecurity.ae',
    description: 'Security systems, CCTV and access control solutions.',
  },
];

/** [company, department, locations, designations] — the frontend's master data (gs-hrms lib/data.ts DEPARTMENTS and
    DESIGNATIONS), so the screens show the same structure once they read it from the API. Heads are not seeded:
    they are frontend-only names until the employees module exists. */
const STRUCTURE: [string, string, string[], string[]][] = [
  ['GSIT', 'Management & Administration', ['Dubai', 'Kochi'], ['General Manager', 'Admin Manager', 'Admin Executive']],
  ['GSIT', 'HR', ['Dubai', 'Kochi'], ['HR Manager', 'HR Executive', 'Talent Acquisition Manager', 'Recruiter']],
  ['GSIT', 'Sales', ['Dubai'], ['Account Manager', 'Senior Sales Executive']],
  ['GSIT', 'Cloud & Infra', ['Dubai'], ['Solutions Architect']],
  ['GSIT', 'Network Engineering', ['Dubai'], ['Network Engineer']],
  ['GSIT', 'Procurement', ['Dubai'], ['Procurement Officer']],
  ['GSIT', 'Managed Services', ['Kochi'], ['Support Lead', 'Support Engineer']],
  ['GSIT', 'Finance', ['Kochi'], ['Accounts Executive']],
  ['GSD', 'Management & Administration', ['Dubai'], ['Admin Executive']],
  ['GSD', 'Sales', ['Dubai'], ['Account Manager']],
  ['GSAV', 'Management & Administration', ['Dubai'], ['Admin Executive']],
  ['GSAV', 'Sales', ['Dubai'], ['Senior Sales Executive', 'Account Manager']],
  ['GSS', 'Management & Administration', ['Dubai', 'Kochi'], ['Admin Manager', 'Admin Executive']],
  ['GSS', 'HR', ['Dubai', 'Kochi'], []],
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
    code: 'GS-155',
    name: 'Dev TA Manager',
    role: 'Talent Acquisition Manager',
    co: 'GSIT',
    dept: 'HR',
    title: 'Talent Acquisition Manager',
    manager: 'GS-120',
  },
  {
    code: 'GS-156',
    name: 'Dev Recruiter',
    role: 'Recruiter',
    co: 'GSIT',
    dept: 'HR',
    title: 'Recruiter',
    manager: 'GS-155',
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

/** A fictional starting profile (all personas work in Dubai, so the UAE contact groups apply). Only fills what is
    still empty, so re-seeding never overwrites edits made locally. */
async function seedProfile(employeeId: string, code: string, name: string) {
  const n = Number(code.slice(3)) || 1;
  const first = name.split(' ')[1] ?? name;
  await prisma.employeeProfile.upsert({
    where: { employeeId },
    update: {},
    create: {
      employeeId,
      dateOfBirth: new Date(`${1985 + (n % 12)}-0${1 + (n % 9)}-15`),
      nationality: ['India', 'UAE', 'Philippines', 'UK'][n % 4],
      gender: n % 2 ? 'Male' : 'Female',
      maritalStatus: n % 3 ? 'Married' : 'Single',
      bloodGroup: ['O+', 'A+', 'B+', 'AB+'][n % 4],
      personalEmail: `${code.toLowerCase()}.personal@example.com`,
      personalMobile: `+971 50 000 0${String(n).padStart(3, '0')}`,
      currentAddress: `Apartment ${n}, Example Residence, Dubai`,
      permanentAddress: `Example Street ${n}, Home City`,
      workPhone: '+971 4 000 0000',
      extension: String(100 + n),
      seatingLocation: 'Floor 3',
      totalExperience: `${4 + (n % 8)} yr 0 mo`,
    },
  });
  const empty = async (count: Promise<number>) => (await count) === 0;
  if (await empty(prisma.emergencyContact.count({ where: { employeeId } }))) {
    await prisma.emergencyContact.createMany({
      data: [
        {
          employeeId,
          position: 0,
          group: 'Local Emergency Contact (UAE)',
          name: `${first} Contact A`,
          relationship: 'Friend',
          mobile: '+971 55 000 0001',
        },
        {
          employeeId,
          position: 1,
          group: 'Home Country Emergency Contact',
          name: `${first} Contact B`,
          relationship: 'Parent',
          mobile: '+44 20 0000 0001',
        },
      ],
    });
  }
  if (await empty(prisma.workExperience.count({ where: { employeeId } }))) {
    await prisma.workExperience.create({
      data: {
        employeeId,
        position: 0,
        company: 'Example Systems LLC',
        location: 'Dubai, UAE',
        fromDate: new Date('2018-02-01'),
        toDate: new Date('2021-12-31'),
        title: 'Associate',
        workMode: 'Onsite',
      },
    });
  }
  if (await empty(prisma.education.count({ where: { employeeId } }))) {
    await prisma.education.create({
      data: {
        employeeId,
        position: 0,
        qualification: "Bachelor's Degree",
        institution: 'Example University',
        course: 'Bachelor of Science',
        field: 'Business',
        startYear: 2010,
        endYear: 2014,
      },
    });
  }
  if (await empty(prisma.familyMember.count({ where: { employeeId } }))) {
    await prisma.familyMember.create({
      data: { employeeId, position: 0, name: `${first} Relative`, relationship: 'Parent', occupation: 'Retired' },
    });
  }
  // Identity and bank (UAE template). Fictional numbers, encrypted like real ones.
  const bban = `0330000010000000${String(n).padStart(3, '0')}`;
  const iban = `AE${String(98n - (BigInt(`${bban}101400`) % 97n)).padStart(2, '0')}${bban}`;
  await prisma.employeeIdentityBank.upsert({
    where: { employeeId },
    update: {},
    create: {
      employeeId,
      passportNumberEnc: cipher.encrypt(`N${String(1000000 + n)}`),
      passportExpiry: new Date('2031-06-30'),
      emiratesIdEnc: cipher.encrypt(`784-${1985 + (n % 12)}-${String(n).padStart(7, '0')}-1`),
      emiratesIdExpiry: new Date('2027-03-31'),
      visaExpiry: new Date('2027-03-31'),
      labourCardIssue: new Date('2025-04-01'),
      labourCardExpiry: new Date('2027-03-31'),
      paymentMode: 'WPS Transfer',
      bankName: 'Example Bank',
      accountName: name,
      accountNumberEnc: cipher.encrypt(iban),
      branchCode: '803320101',
    },
  });
  // Salary (UAE components, AED). Fictional round figures; added only when the person has none.
  if (await empty(prisma.salaryComponent.count({ where: { employeeId } }))) {
    const basic = 6000 + (n % 10) * 500;
    await prisma.salaryComponent.createMany({
      data: [
        ['Basic Salary', basic],
        ['Transportation Allowance', 800],
        ['Accommodation Allowance', Math.round(basic * 0.4)],
      ].map(([label, amount], position) => ({
        employeeId,
        kind: 'EARNING' as const,
        position,
        label: String(label),
        amount: `${amount}.00`,
      })),
    });
  }
}

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
    await seedProfile(e.id, p.code, p.name);
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
