import { Router } from 'express';
import { deleteDefinition, listDefinitions, upsertDefinition } from '../definitions';
import { SystemDefinition } from '../types';

export const definitionsRouter = Router();

definitionsRouter.get('/', (_req, res) => {
  res.json(listDefinitions());
});

// Create or update a system definition. Builtins can be edited but not deleted.
definitionsRouter.put('/:id', (req, res) => {
  const body = req.body || {};
  const def: SystemDefinition = {
    id: req.params.id,
    name: body.name,
    description: body.description,
    builtin: !!body.builtin,
    match: body.match || {},
    defaultModuleIds: body.defaultModuleIds || [],
    channel: body.channel || 'ssh',
    icon: body.icon,
  };
  if (!def.name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  upsertDefinition(def);
  res.json(def);
});

definitionsRouter.delete('/:id', (req, res) => {
  deleteDefinition(req.params.id);
  res.json({ ok: true });
});
