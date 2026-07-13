# Enrich Solar Control Centre

React control-centre dashboard with the Maharashtra SLDC Data Scout integrated into the same application and port.

## Features

- Existing solar operations dashboard, live map, weather, alarms, events, and simulation data
- Compact seven-site MH SLDC communication and power-injection visual
- Full React SLDC dashboard opened from the summary visual or SLDC navigation item
- Combined generation/export calculated from communicating SLDC sites
- Integrated FastAPI collector, historical storage, availability API, and React static hosting
- Persistent alarm/event history with lifecycle-based communication incidents
- Site weather portal with live forecasts and historical hourly data
- Filterable SLDC reports with Excel export
- Automatic refresh, focus recovery, and network-reconnection refresh across live views

## Setup

Install Node.js, Python 3.11+, Chrome, Tesseract OCR, and the Microsoft ODBC Driver if SQL Server is used.

```powershell
npm install
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item sldc\.env.example sldc\.env
```

Configure database and Tesseract values in `sldc/.env`. When no SQL connection is supplied, the application uses a local SQLite database.

## One-port operation

Stop any standalone Vite or old SLDC process using port 5173, then run:

```powershell
npm start
```

Open `http://localhost:5173`. The same process serves the React application and these APIs:

- `GET /api/sldc/live`
- `GET /api/sldc/samples`
- `GET /api/sldc/availability`
- `GET /api/sldc/fleet-availability`
- `GET /api/sldc/incidents/active`
- `GET /api/sldc/report.xlsx`
- `GET /api/operations/logs`
- `GET /api/weather/forecast`
- `GET /api/weather/history`
- `GET /health`

The simulated plant telemetry remains enabled. Live MH SLDC, weather, reports, communication incidents, availability, alarms, and events refresh automatically without requiring the browser refresh button.

## Production configuration

Do not commit `sldc/.env`. Create it from `sldc/.env.example` on the production host and supply the database connection, Tesseract path, and port there. Runtime databases, logs, virtual environments, dependencies, and generated frontend builds are ignored by Git.

For frontend-only development, `npm run dev` still provides Vite hot reload, but live integrated API data is available through the one-port `npm start` command.

## Tests

```powershell
npm run lint
npm run build
pytest -q tests
```
<<<<<<< HEAD

## Docker

Build and run the app in a Linux container:

```powershell
docker build -t enrich-control-centre .
docker run --rm -p 5173:5173 --env-file sldc/.env enrich-control-centre
```

If you prefer Compose:

```powershell
docker compose up --build
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on a GitHub-hosted `ubuntu-latest` runner and verifies `npm run lint`, `npm run build`, `docker build`, and `pytest -q tests` on every push and pull request.

GitHub-hosted runners are ephemeral, so they are great for CI checks but not for keeping the app running continuously. Use Docker Compose or a VM/server for actual hosting.
=======
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979
