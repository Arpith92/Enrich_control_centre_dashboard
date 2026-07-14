l# Enrich Solar Control Centre

React control-centre dashboard with the Maharashtra SLDC Data Scout integrated into the same application and port.

## Features

- Existing solar operations dashboard, live map, weather, alarms, events, and simulation data
- Compact seven-site MH SLDC communication and power-injection visual
- Full React SLDC dashboard opened from the summary visual or SLDC navigation item
- Combined generation/export calculated from communicating SLDC sites
- Integrated FastAPI collector, historical storage, availability API, and React static hosting

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
- `GET /health`

For frontend-only development, `npm run dev` still provides Vite hot reload, but live integrated API data is available through the one-port `npm start` command.

## Two-port development

Run the backend and frontend in separate terminals:

```powershell
npm run serve
npm run dev
```

Open `http://localhost:10001`. Vite proxies API requests to the backend at
`http://localhost:10002`.

## Tests

```powershell
npm run lint
npm run build
pytest -q tests
```

## Docker

Build and run the app in a Linux container:

```powershell
docker build -t enrich-control-centre .
docker run --rm -p 5173:5173 --env-file sldc/.env enrich-control-centre
```

If you prefer Compose with Nginx in front of the app:

```powershell
docker compose up --build
```

This starts two containers:
- `control-centre` on the internal Docker network
- `nginx` exposed on port `8081` and proxying to the app container

Open the app at:

```text
http://192.168.41.197:8081
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on a GitHub-hosted `ubuntu-latest` runner and verifies `npm run lint`, `npm run build`, `docker build`, and `pytest -q tests` on every push and pull request.

GitHub-hosted runners are ephemeral, so they are great for CI checks but not for keeping the app running continuously. Use Docker Compose or a VM/server for actual hosting.
