import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { db } from './db';
import { config } from './config';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
}

// Create the first-run admin account if no users exist yet.
export function seedAdmin(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (count > 0) return;
  const hash = bcrypt.hashSync(config.adminPass, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
    config.adminUser,
    hash
  );
  // eslint-disable-next-line no-console
  console.log(`[auth] seeded admin user "${config.adminUser}"`);
}

export function verifyLogin(username: string, password: string): UserRow | null {
  const user = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  if (!user) return null;
  return bcrypt.compareSync(password, user.password_hash) ? user : null;
}

export function issueToken(user: UserRow): string {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export interface AuthedRequest extends Request {
  user?: { id: number; username: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'missing token' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as {
      sub: number;
      username: string;
    };
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
