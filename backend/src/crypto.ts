import crypto from 'crypto';
import { config } from './config';

// AES-256-GCM encryption for secrets at rest (SSH keys / passwords for target hosts).
// The key is derived from PANOPTES_SECRET_KEY with scrypt. Secrets are never logged
// or returned to the client in plaintext.

const KEY = crypto.scryptSync(config.secretKey, 'panoptes-secret-salt', 32);

export interface Sealed {
  enc: string; // base64 ciphertext
  iv: string; // base64 iv
  tag: string; // base64 auth tag
}

export function encrypt(plain: string): Sealed {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decrypt(sealed: Sealed): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(sealed.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(sealed.enc, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
