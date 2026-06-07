import { db } from './db';
import { encrypt, decrypt } from './crypto';
import { AuthType } from './types';

export interface CredentialInput {
  systemId: number;
  username: string;
  port?: number;
  authType: AuthType;
  secret: string; // password or private key (PEM)
  passphrase?: string;
}

export interface ResolvedCredential {
  id: number;
  systemId: number;
  username: string;
  port: number;
  authType: AuthType;
  secret: string;
  passphrase?: string;
}

export interface CredentialSummary {
  id: number;
  systemId: number;
  username: string;
  port: number;
  authType: AuthType;
}

// A system has at most one stored credential; saving replaces the previous one.
export function saveCredential(input: CredentialInput): number {
  db.prepare('DELETE FROM credentials WHERE system_id = ?').run(input.systemId);
  const sealed = encrypt(input.secret);
  const pass = input.passphrase ? encrypt(input.passphrase) : null;
  const info = db
    .prepare(
      `INSERT INTO credentials
       (system_id, username, port, auth_type, secret_enc, secret_iv, secret_tag,
        passphrase_enc, passphrase_iv, passphrase_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.systemId,
      input.username,
      input.port ?? 22,
      input.authType,
      sealed.enc,
      sealed.iv,
      sealed.tag,
      pass?.enc ?? null,
      pass?.iv ?? null,
      pass?.tag ?? null
    );
  return Number(info.lastInsertRowid);
}

export function getCredentialSummary(systemId: number): CredentialSummary | null {
  const row = db.prepare('SELECT * FROM credentials WHERE system_id = ?').get(systemId) as any;
  if (!row) return null;
  return {
    id: row.id,
    systemId: row.system_id,
    username: row.username,
    port: row.port,
    authType: row.auth_type,
  };
}

// Decrypts the credential — only used server-side at execution time, never returned to clients.
export function resolveCredential(systemId: number): ResolvedCredential | null {
  const row = db.prepare('SELECT * FROM credentials WHERE system_id = ?').get(systemId) as any;
  if (!row) return null;
  const secret = decrypt({ enc: row.secret_enc, iv: row.secret_iv, tag: row.secret_tag });
  const passphrase =
    row.passphrase_enc && row.passphrase_iv && row.passphrase_tag
      ? decrypt({ enc: row.passphrase_enc, iv: row.passphrase_iv, tag: row.passphrase_tag })
      : undefined;
  return {
    id: row.id,
    systemId: row.system_id,
    username: row.username,
    port: row.port,
    authType: row.auth_type,
    secret,
    passphrase,
  };
}
