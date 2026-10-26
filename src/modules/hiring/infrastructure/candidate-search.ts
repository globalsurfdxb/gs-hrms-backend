import type { Prisma } from '../../../generated/prisma/client.js';

/** Text search over the fields HR looks people up by (frontend candidate and pipeline search). */
export function candidateSearch(q: string): Prisma.CandidateWhereInput {
  const contains = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [
      { name: contains },
      { email: contains },
      { phone: contains },
      { currentCompany: contains },
      { currentTitle: contains },
      { currentCity: contains },
      { tags: { has: q } },
    ],
  };
}
