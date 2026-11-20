import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { employeeScopeOf, inEmployeeScope, type EmployeeScope } from '../../../core/iam/data-scope.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { FieldCipher, mask } from '../../../shared/crypto/field-cipher.js';
import { AppError, forbidden, notFound } from '../../../shared/errors/app-error.js';
import { dateOfDay, dayOf } from '../../../shared/time/calendar-day.js';
import { IdentityBankResponse, RevealedNumberResponse } from '../api/dto/identity-bank.response.js';
import type { UpdateIdentityBankDto } from '../api/dto/update-identity-bank.dto.js';
import {
  ALL_FIELDS,
  BANK_FIELDS,
  checkIdentityBank,
  CURRENCY,
  DAY_FIELDS,
  LABELS,
  normalise,
  SECRET_FIELDS,
  TEXT_FIELDS,
  type IdentityBankField,
  type IdentityBankProblem,
  type IdentityBankState,
  type SecretField,
} from '../domain/identity-bank.rules.js';
import {
  IdentityBankRepository,
  type IdentityBankAudit,
  type IdentityBankData,
  type IdentityBankRecord,
} from '../infrastructure/identity-bank.repository.js';

const { identityBank, revealNumbers } = PERMISSIONS.employee;
type Plain = Record<IdentityBankField, string | null>;

const SECRET = new Set<IdentityBankField>(SECRET_FIELDS);
const DAY = new Set<IdentityBankField>(DAY_FIELDS);
const BANK = new Set<IdentityBankField>(BANK_FIELDS);
const UPPER = new Set<IdentityBankField>(['branchCode', 'pfMemberId']);
const encColumn = (f: SecretField) => `${f}Enc` as const;
const isDay = (s: string) => !Number.isNaN(dateOfDay(s).getTime()) && dayOf(dateOfDay(s)) === s;

/* Identity, bank and PF details (spec docs/modules/employees.md; security rule 10). Access is decided by permission:
     read   — Identity & bank details → View, within the caller's directory scope; anyone may read their own
     edit   — Identity & bank details → Edit, within the caller's Directory → Edit scope
     reveal — Reveal full numbers, on a record the caller may read; every reveal writes an audit row
   Numbers are encrypted with FieldCipher, returned masked, and masked in the audit log. */
@Injectable()
export class IdentityBankService {
  constructor(
    private readonly repo: IdentityBankRepository,
    private readonly cipher: FieldCipher,
  ) {}

  async get(employeeCode: string, user: AuthUser): Promise<IdentityBankResponse> {
    const r = await this.find(employeeCode, readScope(user));
    return this.view(r, this.plain(r), user);
  }

  async update(employeeCode: string, dto: UpdateIdentityBankDto, user: AuthUser): Promise<IdentityBankResponse> {
    if (!hasPermission(user.permissions, identityBank, 'edit')) {
      throw forbidden('employee.identity_bank_edit_not_allowed', 'You may not change identity or bank details');
    }
    const r = await this.find(employeeCode, employeeScopeOf(user, 'edit'));
    const template = r.location.template;
    const cur = this.plain(r);

    const changed = new Set<IdentityBankField>();
    const next: IdentityBankState = { ...cur };
    const problems: IdentityBankProblem[] = [];
    for (const f of ALL_FIELDS) {
      const raw = dto[f];
      if (raw === undefined) continue;
      let v: string | null = raw === null ? null : raw.trim() || null;
      if (v != null && SECRET.has(f)) v = normalise(f as SecretField, v);
      if (v != null && UPPER.has(f)) v = v.toUpperCase();
      if (v != null && DAY.has(f) && !isDay(v)) problems.push({ field: f, message: `${LABELS[f]} is not a real date` });
      if (v === cur[f]) continue;
      next[f] = v;
      changed.add(f);
    }
    problems.push(...checkIdentityBank(next, changed, template));
    if (problems.length) {
      throw new AppError('request.invalid', 'The identity or bank details have invalid values', 400, {
        fields: problems.map((p) => p.message),
        problems,
      });
    }
    // Nothing changed: no write and no audit row.
    if (!changed.size) return this.view(r, cur, user);

    const data: IdentityBankData = {};
    const identity: IdentityBankAudit = {
      module: 'Employee',
      action: 'employee.identity_updated',
      before: {},
      after: {},
    };
    const bank: IdentityBankAudit = { module: 'Bank', action: 'employee.bank_updated', before: {}, after: {} };
    for (const f of changed) {
      const v = next[f] ?? null;
      if (SECRET.has(f)) {
        const s = f as SecretField;
        data[encColumn(s)] = v == null ? null : this.cipher.encrypt(v);
      } else if (DAY.has(f)) {
        data[f as (typeof DAY_FIELDS)[number]] = v == null ? null : dateOfDay(v);
      } else {
        data[f as (typeof TEXT_FIELDS)[number]] = v;
      }
      // Security rule 11: the audit log never holds a whole number.
      const shown = (x: string | null) => (x != null && SECRET.has(f) ? mask(x) : x);
      const a = BANK.has(f) ? bank : identity;
      (a.before as Record<string, string | null>)[f] = shown(cur[f]);
      (a.after as Record<string, string | null>)[f] = shown(v);
    }
    const audits = [identity, bank].filter((a) => Object.keys(a.after).length);
    const saved = await this.repo.save(r.id, data, audits, actorOf(user));
    return this.view(saved, this.plain(saved), user);
  }

  async reveal(employeeCode: string, field: SecretField, user: AuthUser): Promise<RevealedNumberResponse> {
    if (!hasPermission(user.permissions, revealNumbers)) {
      throw forbidden('employee.reveal_not_allowed', 'You may not reveal full identity or bank numbers');
    }
    const r = await this.find(employeeCode, readScope(user));
    const stored = r.identityBank?.[encColumn(field)];
    if (!stored) throw new AppError('employee.number_not_on_file', `${LABELS[field]} is not on file`, 404);
    const value = this.cipher.decrypt(stored);
    await this.repo.recordReveal(r.id, LABELS[field], actorOf(user));
    const res = new RevealedNumberResponse();
    res.field = field;
    res.value = value;
    return res;
  }

  private async find(employeeCode: string, scope: EmployeeScope): Promise<IdentityBankRecord> {
    const r = await this.repo.findByCode(scope, employeeCode.toUpperCase());
    if (!r) throw notFound('employee');
    return r;
  }

  /** The record as plain values (numbers decrypted, dates as YYYY-MM-DD). Stays inside this service. */
  private plain(r: IdentityBankRecord): Plain {
    const row = r.identityBank;
    const out = {} as Plain;
    for (const f of SECRET_FIELDS) {
      const enc = row?.[encColumn(f)];
      out[f] = enc ? this.cipher.decrypt(enc) : null;
    }
    for (const f of DAY_FIELDS) out[f] = row?.[f] ? dayOf(row[f]) : null;
    for (const f of TEXT_FIELDS) out[f] = row?.[f] ?? null;
    return out;
  }

  private view(r: IdentityBankRecord, p: Plain, user: AuthUser): IdentityBankResponse {
    const masked = {} as Record<SecretField, string | null>;
    for (const f of SECRET_FIELDS) masked[f] = p[f] == null ? null : mask(p[f]);
    const template = r.location.template;
    return IdentityBankResponse.from({
      employeeCode: r.employeeCode,
      template,
      currency: CURRENCY[template],
      masked,
      values: {
        passportExpiry: p.passportExpiry,
        passportName: p.passportName,
        emiratesIdExpiry: p.emiratesIdExpiry,
        visaExpiry: p.visaExpiry,
        labourCardIssue: p.labourCardIssue,
        labourCardExpiry: p.labourCardExpiry,
        aadhaarName: p.aadhaarName,
        panName: p.panName,
        pfEnrolled: p.pfEnrolled,
        uanMobile: p.uanMobile,
        pfMemberId: p.pfMemberId,
        epsEligibility: p.epsEligibility,
        paymentMode: p.paymentMode,
        bankName: p.bankName,
        accountName: p.accountName,
        branchCode: p.branchCode,
        branchName: p.branchName,
      },
      canEdit:
        hasPermission(user.permissions, identityBank, 'edit') && inEmployeeScope(employeeScopeOf(user, 'edit'), r),
      canReveal: hasPermission(user.permissions, revealNumbers),
    });
  }
}

/** Identity & bank → View reads within the directory scope; without it, only your own record. */
const readScope = (user: AuthUser): EmployeeScope =>
  hasPermission(user.permissions, identityBank) ? employeeScopeOf(user) : { kind: 'SELF', employeeId: user.employeeId };
