# External Source References

This directory is reserved for optional read-only references to the online front-end source and backend API source.

Suggested layout:

```text
external/online-frontend/ # swifood-cashier-ipad-h5: 在线前端源码
external/backend-api/     # phpay-food: 后端接口源码
```

Current absolute paths:

- Online front-end source: `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5`
- Backend API source: `/Users/wayne/paycools/swifood/back-end/phpay-food`

Do not edit reference source through this directory. The offline Windows cashier is the only default editable workspace.

Recommended starting point:

- Do not copy reference source into this directory yet.
- Let Codex read references through absolute paths when needed.
- Store reusable findings in `.codex/context/`.

If repeated source lookup becomes common, choose one explicit strategy:

- symlinks for local-only convenience,
- git submodules for reproducible references,
- source copies for snapshots,
- or continue using absolute paths only.
