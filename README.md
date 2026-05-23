# placestolive

A personal "where should I live?" tool. Set preferences across climate, politics, cost of living, crime, disaster risk, demographics, and geography — get a ranked list of US counties that match, visualized on a heatmap.

## Quick start

**Always-on install (Windows Service via shawl):**
```powershell
scripts\install-service.bat   # run as Administrator (one-time)
net start placestolive
```

**Dev mode (hot-reload):**
```
start.bat
```

Open http://127.0.0.1:8500 — UI and API served from the same port. No Docker required; runs from a local Python venv.

## Docs
- [DEPLOYMENT.md](./DEPLOYMENT.md) — local + DreamHost deploy
- [NEXT_SESSION.md](./NEXT_SESSION.md) — current session handoff
