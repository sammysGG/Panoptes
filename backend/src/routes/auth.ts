import { Router } from 'express';
import { issueToken, requireAuth, verifyLogin, AuthedRequest } from '../auth';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }
  const user = verifyLogin(username, password);
  if (!user) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({ token: issueToken(user), user: { id: user.id, username: user.username } });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});
