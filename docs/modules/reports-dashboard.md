# Reports & dashboards

- Status: Planned
- Phase: 4
- Source modules: `src/modules/reports/`, `src/modules/dashboard/`

## Frontend sources

`lib/reportEngine.ts` (`buildReport`), `app/reports`, `app/dashboard`, `app/hiring/reports`, `app/hiring/dashboard`,
`lib/headcount.ts`.

## Reports (33)

- Employee (7): dashboard, headcount, additions, attrition, distribution, diversity, exit by tenure.
- Leave (8): daily, availability, balance, booked, type summary, encashment, loss of pay, payroll.
- Attendance (7): daily, early/late punch, presence, hours, payroll, muster roll, consecutive absences.
- Performance (11): goals, skills, feedback, status, rating, score, nine-box, appraisal feedback, history, summary, extension.
- Hiring: funnel, by source, rejection reasons, open-position ageing, time to hire, manager workload, recruiter figures.

Each report: SQL in `infrastructure/` (raw tagged queries allowed), columns + rows, scoped to the caller's data
scope and location filter, CSV export via `shared/security/csv.ts` (audited).

Scheduled reports: report, frequency (daily/weekly/monthly), format (CSV/Excel/PDF), recipients, scope →
pg-boss job + mail.

## Dashboards

Role-specific: Employee (my requests, renewals, today, growth), Team Lead (decisions waiting, team attendance,
team renewals, overdue reviews/training), Admin (headcount KPIs, needs-attention list, 90-day renewal calendar,
attendance mix, celebrations). One endpoint per widget group; cache short-lived if needed.
