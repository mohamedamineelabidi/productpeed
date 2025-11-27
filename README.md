
# SpeedScale E-Commerce: Distributed System with AI

**SpeedScale** is an advanced E-Commerce platform designed to demonstrate the performance architecture of distributed systems and Machine Learning integration. It uses a 3-node architecture to visualize the latency differences between Cold Storage (MongoDB) and Hot Cache (Redis), and features an AI-powered recommendation engine.

## 🏛️ System Architecture

![SpeedScale architecture flow](img/architecture.png)

The diagram shows how each container participates in the end-to-end journey. Within the `speedscale-net` bridge network, Nginx in the `speedscale-frontend` container proxies every `/backend` request to the FastAPI gateway (`speedscale-node-c`). The gateway first consults Redis (`speedscale-node-b`) for cached payloads, and on a miss it queries MongoDB (`speedscale-node-a`) before writing fresh results back to Redis with a short TTL. A dedicated Redis Commander UI (`speedscale-redis-ui`) shares the same network so you can inspect cache keys in real time. All components run on your local host, with persistent product data stored in the `mongodb_data` Docker volume so restarts do not wipe the catalog.

The system simulates a modern microservices architecture:

1.  **Node A (Data Node): MongoDB**
    *   Stores the "Truth" (Persistent data).
    *   Contains 2,000+ auto-generated products.
    *   High reliability, higher latency (~100ms+).
2.  **Node B (Compute/Cache Node): Redis Stack**
    *   Stores "Hot" data.
    *   Used for transient caching.
    *   Extremely low latency (<10ms).
3.  **Node C (Gateway Node): FastAPI (Python)**
    *   The API Entry point.
    *   Handles traffic routing (Read-Through caching strategy).
    *   **AI Engine:** Runs a TF-IDF + Nearest Neighbors model for product recommendations.
    *   Performs data seeding on startup.

---

## 🛠️ Setup Guide (Local Development)

Follow these steps to run the entire stack locally on your machine.

### Prerequisites
*   **Python 3.10+**
*   **Node.js** (v18 or higher)
*   **MongoDB** (Installed locally or via Docker).
*   *(Optional)* **Redis** (Installed locally or via Docker).

### Step 1: Start the Backend (FastAPI)

1.  Open your project folder in VS Code.
2.  Open a terminal (`Ctrl + ~`).
3.  Create and activate a virtual environment (if not already done):
    ```powershell
    python -m venv .venv
    .\.venv\Scripts\Activate
    ```
4.  Install dependencies:
    ```powershell
    pip install -r backend/requirements.txt
    ```
5.  **Train the AI Model:**
    Before starting the server, you need to generate the ML artifacts.
    *   Ensure MongoDB is running locally.
    *   Run the training notebook: `backend/app/ml/training.ipynb` (Run all cells).
    *   *Alternatively, the system will use a fallback if no model is found.*

6.  Start the API Server:
    ```powershell
    python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
    ```
    *   The server will start on **http://localhost:8000**.
    *   It will automatically seed MongoDB with 2,000 products if empty.

### Step 2: Start the Frontend (React + Vite)

1.  Open a **second terminal** in VS Code.
2.  Change into the frontend workspace:
    ```powershell
    Set-Location apps/frontend
    ```
3.  Install dependencies:
    ```powershell
    npm install
    ```
4.  Start the development server:
    ```powershell
    npm run dev
    ```
5.  Open your browser to **http://localhost:3000**.

---

## 🐳 Setup Guide (Docker Production Mode)

To run the entire stack (Database + Cache + API) in isolated containers:

1.  Ensure Docker Desktop is running.
2.  Run the compose command:
    ```powershell
    docker-compose up --build
    ```
3.  Access the frontend at **http://localhost:3000**.
    *   *Note: The Docker setup includes the ML model artifacts if they were generated locally.*

---

## 🧪 Features to Test

### 1. 🤖 AI Recommendations (Machine Learning)
1.  Click on any product in the dashboard.
2.  Scroll down to **"Similar Products"**.
3.  The system uses **Scikit-Learn** to analyze the product description and find semantically similar items.
4.  Look for the source tag: `ML_ENGINE 🤖`.

### 2. ⚡ Caching (Redis vs Mongo)
1.  Search for "Keyboard".
2.  **First Request:** Hits MongoDB (Slower, `MONGODB_DISK`).
3.  **Second Request:** Hits Redis (Instant, `REDIS_CACHE`).
4.  Observe the latency graph in the dashboard.

### 3. 🛡️ Resilience
1.  Stop the backend server.
2.  The Frontend will show a "Backend Unavailable" banner.
3.  Enable **Demo Mode** to continue using the UI with simulated data.

---

## 📂 Project Structure

```
Productspeed/
├── apps/
│   └── frontend/           # React + Vite dashboard
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   ├── config/
│       │   └── types/
│       ├── package.json
│       └── vite.config.ts
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI entry point
│   │   └── ml/
│   │       ├── recommender.py
│   │       ├── training.ipynb
│   │       └── artifacts/
│   ├── scripts/
│   │   └── seed.py
│   ├── tests/
│   │   └── test_ml_endpoint.py
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml      # Full stack orchestration
└── README.md               # Documentation
```
