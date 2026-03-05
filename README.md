# Utpad Web Admin Command Center

Angular admin dashboard for Utpad operations control:
- Command-center analytics (production in hand, dispatch-ready, wastage, reorder risk).
- Live worker event feed across Inwarding, Production, Packing, Dispatch.
- Worker credential creation.
- Feature access control (module-level grant/revoke).
- Session visibility and access revoke/enable.

## Run

```bash
npm install
npm run start -- --host 0.0.0.0 --port 4200
```

Open: `http://localhost:4200/`

## Shared Backend Stream

Command-center live updates now subscribe to backend SSE and API:
- `GET /api/v1/ops/events/stream`
- `GET /api/v1/ops/events`
- `POST /api/v1/ops/events`

Configured via `environment.apiBaseUrl` in:
- `src/environments/environment.ts`
- `src/environments/environment.prod.ts`

## Build

```bash
npm run build
```

## Command Center Flow

1. Login and open `Dashboard -> Command Center`.
2. Submit entries from module pages (`Inwarding`, `Production`, `Packing`, `Dispatch`).
3. Command-center cards and live feed update immediately.
4. Use `Users` to create credentials and grant/revoke module access.
5. Use `Sessions` to monitor activity and revoke/enable worker access.
