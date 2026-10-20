import { safeCsvCell, toCsv } from './csv.js';

describe('safeCsvCell', () => {
  it.each(['=SUM(A1)', '+1', '-1+2', '@cmd'])('neutralises formula %s', (v) => {
    expect(safeCsvCell(v).startsWith("'")).toBe(true);
  });

  it('quotes commas and quotes', () => {
    expect(safeCsvCell('a,"b"')).toBe('"a,""b"""');
  });

  it('builds rows', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('a,b\r\n1,');
  });
});
