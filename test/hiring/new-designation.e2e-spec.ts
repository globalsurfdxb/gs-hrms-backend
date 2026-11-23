import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp, ORIGIN } from '../app.js';
import { hiringWorld } from './hiring-fixtures.js';

/* BR-HIR-003 (designation required when the department has any) and BR-HIR-020 (a new designation asked for on a
   requisition joins the department when the requisition is fully approved, in the same transaction). Team Lead
   GS-058 raises in GSIT · Cloud & Infra; HR and Super Admin approve. */
describe('Requisitions — designation and new-designation requests (BR-HIR-003, BR-HIR-020)', () => {
  let app: INestApplication<App>;
  let w: Awaited<ReturnType<typeof hiringWorld>>;
  let ref: { companyId: string; departmentId: string; designationId: string; designationTitle: string };

  const future = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const body = (patch: Record<string, unknown> = {}) => ({
    title: 'Edge Network Specialist',
    companyId: ref.companyId,
    departmentId: ref.departmentId,
    locationId: 'Dubai',
    positions: 1,
    employmentType: 'FULL_TIME',
    reason: 'NEW_ROLE',
    budgetMin: '9000',
    budgetMax: '12000',
    targetStart: future,
    hiringManagerId: w.id.teamLead,
    justification: 'Edge rollout for two clients.',
    ...patch,
  });
  const newTitle = () => `Edge Specialist ${randomUUID().slice(0, 8)}`;
  const audit = async (action: string, entityId: string) =>
    (await w.as.superAdmin.get(`/api/admin/audit?action=${action}&entityId=${entityId}`).expect(200)).body.items;

  beforeAll(async () => {
    app = await createTestApp();
    w = await hiringWorld(app);
    const gsit = await w.prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
    const dept = await w.prisma.department.findUniqueOrThrow({
      where: { companyId_name: { companyId: gsit.id, name: 'Cloud & Infra' } },
      include: { designations: { orderBy: { title: 'asc' } } },
    });
    ref = {
      companyId: gsit.id,
      departmentId: dept.id,
      designationId: dept.designations[0].id,
      designationTitle: dept.designations[0].title,
    };
  });
  // Designations this spec added would change what other specs see in Cloud & Infra (the e2e database is shared).
  afterAll(async () => {
    await w.prisma.designation.deleteMany({
      where: { departmentId: ref.departmentId, title: { startsWith: 'Edge Specialist ', mode: 'insensitive' } },
    });
    await app.close();
  });

  it('needs a designation, or a new one, when the department has any', async () => {
    const code = async (patch: Record<string, unknown>) =>
      (await w.send('hr', 'post', '/requisitions', body(patch)).expect(400)).body.code;
    expect(await code({})).toBe('requisition.designation_required');
    expect(await code({ designationId: ref.designationId, proposedDesignation: newTitle() })).toBe(
      'requisition.designation_conflict',
    );
    expect(await code({ proposedDesignation: ` ${ref.designationTitle.toUpperCase()} ` })).toBe(
      'requisition.designation_exists',
    );
    expect(await code({ proposedDesignation: ' x ' })).toBe('requisition.invalid_proposed_designation');
    await w.send('hr', 'post', '/requisitions', body({ designationId: ref.designationId })).expect(201);
  });

  it('adds the new designation to the department on the last approval, and the job carries it', async () => {
    const title = newTitle();
    const raised = (
      await w
        .send(
          'teamLead',
          'post',
          '/requisitions',
          body({ proposedDesignation: `  ${title.replace(' ', '   ')} `, submit: true }),
        )
        .expect(201)
    ).body;
    expect(raised).toMatchObject({ proposedDesignation: title, designation: null });

    // Not added before the chain is complete.
    await w.send('hr', 'post', `/requisitions/${raised.id}/decision`, { decision: 'APPROVED' }).expect(200);
    expect(await w.prisma.designation.count({ where: { departmentId: ref.departmentId, title } })).toBe(0);

    const approved = (
      await w.send('superAdmin', 'post', `/requisitions/${raised.id}/decision`, { decision: 'APPROVED' }).expect(200)
    ).body;
    const added = await w.prisma.designation.findFirstOrThrow({ where: { departmentId: ref.departmentId, title } });
    expect(approved).toMatchObject({
      status: 'APPROVED',
      proposedDesignation: title,
      designation: { id: added.id, name: title },
    });
    expect((await audit('requisition.designation_approved', raised.id))[0].after).toMatchObject({
      designation: title,
      designationId: added.id,
      addedToDepartment: true,
    });
    expect((await audit('designation.created', added.id))[0]).toMatchObject({
      module: 'Organization',
      after: { title, source: `requisition ${raised.code}` },
    });

    const job = await w
      .send('hr', 'post', `/requisitions/${raised.id}/job`, {
        description: 'Roll out and support edge sites.',
        skills: ['SD-WAN'],
        expMin: 2,
        expMax: 6,
        panelIds: [w.id.teamLead],
        closingDate: future,
      })
      .expect(201);
    expect(job.body.designation).toMatchObject({ id: added.id });
  });

  it('reuses a designation another approval already added (any case), and a rejection adds nothing', async () => {
    const title = newTitle();
    const first = (
      await w.send('hr', 'post', '/requisitions', body({ proposedDesignation: title, submit: true })).expect(201)
    ).body;
    const second = (
      await w
        .send('hr', 'post', '/requisitions', body({ proposedDesignation: title.toLowerCase(), submit: true }))
        .expect(201)
    ).body;
    const rejected = (
      await w.send('hr', 'post', '/requisitions', body({ proposedDesignation: newTitle(), submit: true })).expect(201)
    ).body;

    // Team Lead (hiring manager) approves their step; HR raised these, so the HR step is Office Admin's.
    for (const r of [first, second, rejected]) {
      await w.send('teamLead', 'post', `/requisitions/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
      await w.send('officeAdmin', 'post', `/requisitions/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
    }
    const a = (
      await w.send('superAdmin', 'post', `/requisitions/${first.id}/decision`, { decision: 'APPROVED' }).expect(200)
    ).body;
    const b = (
      await w.send('superAdmin', 'post', `/requisitions/${second.id}/decision`, { decision: 'APPROVED' }).expect(200)
    ).body;
    expect(b.designation.id).toBe(a.designation.id);
    expect((await audit('requisition.designation_approved', second.id))[0].after).toMatchObject({
      addedToDepartment: false,
    });

    await w
      .send('superAdmin', 'post', `/requisitions/${rejected.id}/decision`, { decision: 'REJECTED', note: 'No budget' })
      .expect(200);
    expect(
      await w.prisma.designation.count({
        where: { departmentId: ref.departmentId, title: { equals: rejected.proposedDesignation, mode: 'insensitive' } },
      }),
    ).toBe(0);
  });

  it('choosing a designation on an edit withdraws the new one, and the other way round', async () => {
    const draft = (
      await w.send('teamLead', 'post', '/requisitions', body({ proposedDesignation: newTitle() })).expect(201)
    ).body;
    const patch = (send: object) =>
      w.as.teamLead.patch(`/api/hiring/requisitions/${draft.id}`).set('Origin', ORIGIN).send(send);

    const chosen = (await patch({ designationId: ref.designationId }).expect(200)).body;
    expect(chosen).toMatchObject({ designation: { id: ref.designationId }, proposedDesignation: null });

    const proposed = (await patch({ proposedDesignation: 'Edge Lead' }).expect(200)).body;
    expect(proposed).toMatchObject({ designation: null, proposedDesignation: 'Edge Lead' });

    expect((await patch({ proposedDesignation: null }).expect(400)).body.code).toBe('requisition.designation_required');
  });

  it('is limited like any requisition write: no Requisitions permission → 403', async () => {
    await w.send('employee', 'post', '/requisitions', body({ proposedDesignation: newTitle() })).expect(403);
    await w.send('recruiter', 'post', '/requisitions', body({ proposedDesignation: newTitle() })).expect(403);
  });
});
