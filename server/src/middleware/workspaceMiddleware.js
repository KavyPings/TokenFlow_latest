export function workspaceMiddleware(req, res, next) {
  const headerWorkspace = req.headers['x-workspace-id'];
  const candidate = typeof headerWorkspace === 'string' ? headerWorkspace.trim() : '';
  const workspaceId = candidate || 'default';

  req.workspace = { id: workspaceId };
  next();
}

