
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

## 🔄 MongoDB + Redis Integration for Performance Optimization

**Context:** This project demonstrates how to optimize response times for frequent queries by using Redis as a caching layer on top of MongoDB. The system implements a read-through cache pattern where Redis acts as a high-speed intermediary between the application and the persistent database.

### Architecture Overview

The integration follows a three-tier caching strategy:

1. **Primary Storage (MongoDB - "Cold Storage")**
   - Persistent data store containing 2,000+ products
   - Single source of truth for all product information
   - Average query latency: ~100-200ms
   - Handles writes and complex queries

2. **Cache Layer (Redis - "Hot Storage")**
   - In-memory key-value store for frequently accessed data
   - Stores serialized JSON payloads with TTL (Time To Live)
   - Average query latency: <10ms
   - Reduces database load and improves user experience

3. **Gateway Logic (FastAPI)**
   - Implements cache-aside pattern with automatic cache warming
   - Handles cache invalidation and consistency
   - Provides fallback mechanisms when services are unavailable

### a. Redis Cache Configuration

The cache is configured in `backend/app/main.py` with the following settings:

**Connection Setup:**
```python
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
```

**Cache Key Strategies:**
- **Search queries:** `search:{query.lower()}` (TTL: 60 seconds)
- **Product details:** `product:{product_id}` (TTL: 300 seconds)
- **Similar products:** `similar:{product_id}` (TTL: 120 seconds)
- **Search trends:** `global:searches` (Rolling list, 20 most recent)

**Environment Variables:**
- `REDIS_URL`: Redis connection string (default: `redis://127.0.0.1:6379`)
- `MONGO_URI`: MongoDB connection string (default: `mongodb://127.0.0.1:27017/speedscale`)

### b. Performance Comparison: With vs Without Cache

The dashboard visualizes real-time performance metrics for each request:

#### Cold Request (Cache Miss - First Query)
```
User searches "Laptop"
├─ Check Redis: Key "search:laptop" → NOT FOUND
├─ Query MongoDB: db.products.find({name: /laptop/i})
├─ Latency: ~150ms
├─ Write to Redis: SET search:laptop {...} EX 60
└─ Response: {"source": "MONGODB_DISK 🐢", "time": "150ms", "cached": false}
```

#### Hot Request (Cache Hit - Repeated Query)
```
User searches "Laptop" again (within 60 seconds)
├─ Check Redis: Key "search:laptop" → FOUND
├─ Latency: ~5ms
└─ Response: {"source": "REDIS_CACHE ⚡", "time": "5ms", "cached": true}
```

**Performance Gains:**
- **Latency reduction:** 95-97% (150ms → 5ms)
- **Database load:** Reduced by ~80% for repeated queries
- **Throughput:** 10-30x increase in requests per second
- **User experience:** Near-instant search results

**Real-World Metrics (Observable in Dashboard):**
| Scenario | Without Cache | With Cache | Improvement |
|----------|--------------|------------|-------------|
| Product search | 100-200ms | 5-15ms | 10-20x faster |
| Product detail | 80-150ms | 3-10ms | 15-30x faster |
| Similar products | 120-180ms | 5-12ms | 15-25x faster |

### c. Cache Consistency Management

The system implements multiple strategies to maintain data consistency between Redis and MongoDB:

#### 1. **Time-Based Invalidation (TTL)**
- All cache entries expire automatically after their TTL
- Search results: 60 seconds (high volatility)
- Product details: 300 seconds (moderate volatility)
- Similar products: 120 seconds (ML-generated, semi-static)

**Advantages:**
- Simple to implement and maintain
- Prevents stale data from persisting indefinitely
- Balances freshness with performance

**Trade-offs:**
- Brief window where cache may be stale
- Acceptable for read-heavy e-commerce scenarios

#### 2. **Write-Through Strategy** (Future Enhancement)
When a product is updated in MongoDB, the cache is immediately invalidated:
```python
# On product update
await mongo_collection.update_one({"_id": product_id}, update_doc)
await redis_client.delete(f"product:{product_id}")
await redis_client.delete(f"similar:{product_id}")
```

#### 3. **Cache Warming on Startup**
- The FastAPI server seeds MongoDB with 2,000 products on first launch
- Popular searches can be pre-cached using background tasks
- Reduces initial cold-start latency

#### 4. **Fallback Mechanism**
If Redis becomes unavailable:
- System continues to serve from MongoDB
- Response includes `"source": "MONGODB_DISK 🐢"` tag
- No cache writes attempted (fail-safe mode)
- Health endpoint reports Redis status: `"redis": false`

**Testing Cache Consistency:**
1. Open Redis Commander at `http://localhost:8081`
2. Search for a product in the UI (e.g., "Gaming")
3. Observe the `search:gaming` key appear in Redis
4. Wait 60 seconds and observe automatic expiration
5. Search again and watch the cache repopulate

#### 5. **Manual Cache Invalidation**
For administrative purposes, you can flush cache programmatically:
```bash
# Clear all search caches
docker exec speedscale-node-b redis-cli KEYS "search:*" | xargs docker exec speedscale-node-b redis-cli DEL

# Clear specific product cache
docker exec speedscale-node-b redis-cli DEL product:507f1f77bcf86cd799439011
```

### Monitoring Cache Performance

**Tools Provided:**
1. **Redis Commander** (`http://localhost:8081`)
   - Browse all cache keys in real-time
   - Monitor TTL countdown for each key
   - Inspect cached JSON payloads

2. **Health Endpoint** (`http://localhost:8000/health`)
   - Returns connection status for MongoDB and Redis
   - Use for uptime monitoring and alerting

3. **Dashboard Metrics**
   - Every API response includes `source`, `time`, and `cached` fields
   - Frontend displays latency chart comparing cache vs database hits

**Example Health Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-01T10:30:00.123456",
  "connections": {
    "mongodb": true,
    "redis": true
  },
  "servers": {
    "this_server": "Backend API (FastAPI)",
    "mongodb": "Connected",
    "redis": "Connected"
  }
}
```

### Best Practices Demonstrated

1. **Fail-Safe Design:** Application remains functional even if Redis is down
2. **Observability:** Every response includes performance metadata
3. **Separation of Concerns:** Cache logic isolated in gateway layer
4. **Graceful Degradation:** Automatic fallback to MongoDB on cache failure
5. **Resource Efficiency:** TTL prevents unbounded cache growth

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
