import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/* Application-level encryption for sensitive columns: passport, Emirates ID, Aadhaar, PAN, bank account numbers.
   AES-256-GCM, a fresh 12-byte IV per value, output `v1.<iv>.<tag>.<ciphertext>` (base64url).
   `blindIndex` gives a deterministic HMAC for exact-match lookups ("find employee by Emirates ID") without
   storing the plain value. Keys come from Key Vault in Azure; see docs/security.md#field-encryption. */
export class FieldCipher {
  private static readonly VERSION = 'v1';

  constructor(
    private readonly encryptionKey: Buffer,
    private readonly indexKey: Buffer,
  ) {
    if (encryptionKey.length !== 32 || indexKey.length !== 32) throw new Error('FieldCipher keys must be 32 bytes');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [FieldCipher.VERSION, iv, tag, ct]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ct] = payload.split('.');
    if (version !== FieldCipher.VERSION || !iv || !tag || ct === undefined)
      throw new Error('Unrecognised encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Deterministic lookup hash. Normalises case and separators so "784-1990-..." and "7841990..." match. */
  blindIndex(value: string): string {
    const normalised = value.replace(/[\s-]/g, '').toUpperCase();
    return createHmac('sha256', this.indexKey).update(normalised).digest('base64url');
  }
}

/** Show only the last `visible` characters, e.g. for identity numbers in list views. */
export const mask = (value: string, visible = 4) =>
  value.length <= visible ? '•'.repeat(value.length) : `${'•'.repeat(value.length - visible)}${value.slice(-visible)}`;
