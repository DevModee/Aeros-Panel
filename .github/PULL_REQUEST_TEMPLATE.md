## Summary

Describe what changed and why.

## Verification

- [ ] `cd backend && npm run build && npm test`
- [ ] `cd frontend && npm run lint && npm run build`

## Checklist

- [ ] No Docker or background polling daemons introduced
- [ ] Security guards preserved (`assertManageableServiceName`, `validateWorkDir`, `validateRepositoryUrl`, `requireAuth`, `requireSameOriginForMutations`)
- [ ] No secrets, `.env` files, or `*.db` files committed
