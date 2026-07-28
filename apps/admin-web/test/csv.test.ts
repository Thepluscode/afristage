import { describe, expect, it } from 'vitest';
import { toCsv } from '../lib/csv';

describe('toCsv', () => {
  it('emits a header row and CRLF-separated body rows', () => {
    expect(toCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('emits only the header row for an empty body', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });

  it('quotes fields containing a comma, quote, newline or carriage return', () => {
    // an unquoted comma would shift every following column in a spreadsheet
    expect(toCsv(['x'], [['Friday, Live']])).toBe('x\r\n"Friday, Live"');
    // embedded quotes double per RFC 4180
    expect(toCsv(['x'], [['He said "hi"']])).toBe('x\r\n"He said ""hi"""');
    expect(toCsv(['x'], [['line1\nline2']])).toBe('x\r\n"line1\nline2"');
    expect(toCsv(['x'], [['line1\rline2']])).toBe('x\r\n"line1\rline2"');
  });

  it('renders null and undefined as empty rather than the string "null"', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });

  it('leaves ordinary values unquoted', () => {
    expect(toCsv(['a'], [['plain'], [0], [false]])).toBe('a\r\nplain\r\n0\r\nfalse');
  });
});
