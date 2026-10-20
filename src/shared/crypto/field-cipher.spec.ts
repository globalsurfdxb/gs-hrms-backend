import { randomBytes } from 'node:crypto';
import { FieldCipher, mask } from './field-cipher.js';

describe('FieldCipher', () => {
  const cipher = new FieldCipher(randomBytes(32), randomBytes(32));

  it('round-trips a value', () => {
    expect(cipher.decrypt(cipher.encrypt('784-1990-1234567-1'))).toBe('784-1990-1234567-1');
  });

  it('produces a different ciphertext each time', () => {
    expect(cipher.encrypt('ABCDE1234F')).not.toBe(cipher.encrypt('ABCDE1234F'));
  });

  it('rejects tampered ciphertext', () => {
    const enc = cipher.encrypt('secret');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('builds the same blind index regardless of formatting', () => {
    expect(cipher.blindIndex('784-1990-1234567-1')).toBe(cipher.blindIndex('784 1990 1234567 1'));
  });

  it('refuses short keys', () => {
    expect(() => new FieldCipher(randomBytes(16), randomBytes(32))).toThrow();
  });
});

describe('mask', () => {
  it('keeps only the last characters', () => {
    expect(mask('ABCDE1234F')).toBe('••••••234F');
  });
});
