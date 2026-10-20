/* How much data a caller may see for a feature, resolved from their role. Repositories take a scope and filter in
   the query itself — never fetch everything and filter in memory or in the controller.

     SELF      — own records only (Employee)
     TEAM      — self + direct reports (Team Lead; frontend `directReports(me.id)` — direct only, not the tree)
     LOCATION  — everyone in the caller's location
     COMPANY   — everyone in the caller's company
     ALL       — everyone (HR, Super Admin)

   Implemented with the employees module in Phase 1 (ScopedRepository base). Until then, endpoints that return
   employee-owned data must not be added. */
export type DataScope = 'SELF' | 'TEAM' | 'LOCATION' | 'COMPANY' | 'ALL';
