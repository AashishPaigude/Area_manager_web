# Area Manager Backend

This is the brand-new, production-ready backend for the Area Manager application, built with FastAPI, SQLAlchemy, and Pydantic Settings.

## Project Structure

The project has been initialized with a clean, scalable folder architecture:

```text
am_backend/
├── app/
│   ├── config/          # Pydantic Settings & App configuration
│   │   ├── config.py
│   │   └── settings.py
│   ├── core/            # Centralized logging, global exception handling, and custom error handlers
│   │   ├── exceptions.py
│   │   └── logging.py
│   ├── database/        # SQLAlchemy configuration, engines, and Base models
│   │   └── database.py
│   ├── dependencies/    # Reusable dependencies (e.g. database session get_db)
│   │   └── database.py
│   ├── middleware/      # Application middlewares (CORS is configured here)
│   ├── models/          # SQLAlchemy database models (defined in next phase)
│   ├── repositories/    # Data access layer / repository pattern
│   ├── routers/         # API Route definitions
│   ├── schemas/         # Pydantic validation schemas
│   ├── services/        # Business logic services
│   └── utils/           # Shared helper functions
├── main.py              # Application entry point & health check endpoints
├── requirements.txt     # Python package requirements
├── .env                 # Environment configuration (ignored in git)
├── .env.example         # Environment template
└── README.md            # Documentation
```

## Setup & Running Instructions

### Prerequisites
- Python 3.10+
- MySQL database instance running (e.g. `AttendanceApp` database setup)

### 1. Configure the Environment
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and verify/update your MySQL credentials:
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=AttendanceApp
ALLOWED_ORIGINS=http://localhost:5173
```

### 2. Install Dependencies
Create and activate a virtual environment, then install the dependencies:
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Start the Server
Start the development server using `uvicorn`:
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
On startup, the server automatically prints logging details and attempts a connection check to verify database connectivity.

## Endpoints

- **Root API Check**:
  - `GET /`
  - Response:
    ```json
    {
      "message": "Area Manager Backend Running"
    }
    ```
- **Health Check**:
  - `GET /health`
  - Response:
    ```json
    {
      "status": "healthy"
    }
    ```

## Logging
Logs are saved in the `logs/app.log` folder with a detailed rotating file configuration.
