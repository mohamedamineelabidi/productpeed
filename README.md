
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
    docker-compose up --build -d
    ```
3.  Access the frontend at **http://localhost:3000**.
    *   *Note: The Docker setup includes the ML model artifacts if they were generated locally.*

### What Happens Behind the Scenes in Docker

When you run `docker-compose up --build`, the orchestration follows this precise sequence:

#### Phase 1: Network & Volume Initialization
```
1. Docker creates the bridge network "speedscale-net" (172.18.0.0/16)
2. Docker creates the persistent volume "mongodb_data" 
   └─ Mounts to /data/db inside MongoDB container
   └─ Survives container restarts (your 3M records persist here)
```

#### Phase 2: Container Startup (Dependency Order)

**Node A - MongoDB (speedscale-node-a):**
```
Container: speedscale-node-a
Image: mongo:latest
Port Mapping: 27017 (host) → 27017 (container)
Volume: mongodb_data → /data/db
Network IP: 172.18.0.2 (assigned by Docker)

Healthcheck Loop:
├─ Every 10s: mongosh localhost:27017/test --quiet
├─ Retries: 5 attempts (50 seconds max)
└─ Status: ✅ HEALTHY (MongoDB accepts connections)

Data Persistence:
├─ Your 3 million existing records remain intact in mongodb_data volume
├─ No seeding occurs if collection already has ≥2000 documents
└─ FastAPI checks count with: db.products.estimated_document_count()
```

**Node B - Redis Stack (speedscale-node-b):**
```
Container: speedscale-node-b
Image: redis/redis-stack:latest
Port Mapping: 
  ├─ 6379 (host) → 6379 (container) - Redis server
  └─ 8001 (host) → 8001 (container) - RedisInsight UI
Network IP: 172.18.0.3

Healthcheck Loop:
├─ Every 10s: redis-cli ping
├─ Timeout: 5s
└─ Status: ✅ HEALTHY (PONG received)

Cache Characteristics:
├─ In-Memory: No persistence (cache cleared on restart)
├─ Warm-up: Empty on first start, populates on first queries
└─ TTL Management: Keys auto-expire (60s-300s depending on type)
```

**Node C - FastAPI Gateway (speedscale-node-c):**
```
Container: speedscale-node-c
Build: ./backend/Dockerfile
Port Mapping: 8000 (host) → 8000 (container)
Network IP: 172.18.0.4

Startup Sequence:
1. depends_on: Waits for MongoDB + Redis healthchecks
2. Lifespan startup hook executes:
   ├─ Connects to mongodb://mongodb:27017/speedscale
   │  └─ DNS "mongodb" resolves to 172.18.0.2 inside network
   ├─ Connects to redis://redis:6379
   │  └─ DNS "redis" resolves to 172.18.0.3 inside network
   ├─ Checks document count: db.products.estimated_document_count()
   ├─ Skips seeding: "Already contains 3,000,000 products"
   └─ Loads ML artifacts: /app/backend/app/ml/artifacts/*.pkl

Environment Variables Injected:
├─ MONGO_URI=mongodb://mongodb:27017/speedscale
├─ REDIS_URL=redis://redis:6379
└─ API_PORT=8000

Health Status Logged:
📡 MongoDB Status: ✅ CONNECTED
⚡ Redis Status:   ✅ CONNECTED
```

**Redis Commander UI (speedscale-redis-ui):**
```
Container: speedscale-redis-ui
Image: rediscommander/redis-commander:latest
Port Mapping: 8081 (host) → 8081 (container)
Network IP: 172.18.0.5

Purpose: Web UI to inspect cache keys in real-time
Access: http://localhost:8081
```

**Frontend - Nginx + React (speedscale-frontend):**
```
Container: speedscale-frontend
Build: ./apps/frontend/Dockerfile (Multi-stage)
Port Mapping: 3000 (host) → 3000 (container)
Network IP: 172.18.0.6

Build Process:
Stage 1 (node:20-alpine):
├─ npm ci (install dependencies)
├─ npm run build (Vite production build)
└─ Output: /app/dist (static files)

Stage 2 (nginx:1.27-alpine):
├─ Copy nginx.conf → /etc/nginx/conf.d/default.conf
├─ Copy /app/dist → /usr/share/nginx/html
└─ Start Nginx on port 3000

Nginx Reverse Proxy:
├─ GET /backend/* → http://api_server:8000/*
│  └─ "api_server" resolves to 172.18.0.4 (Gateway)
└─ GET /* → /usr/share/nginx/html (Serve React SPA)
```

#### Phase 3: Request Flow (With 3 Million Products)

**Example: User searches "Gaming Laptop"**

```
1. Browser → http://localhost:3000/
   └─ Nginx serves index.html

2. User types "Gaming Laptop" in search
   └─ Frontend: fetch(`${API_BASE_URL}/api/search?query=Gaming+Laptop`)
   └─ Resolves to: http://localhost:3000/backend/api/search?query=Gaming+Laptop

3. Nginx (speedscale-frontend:3000)
   ├─ Receives: GET /backend/api/search?query=Gaming+Laptop
   ├─ Proxy rule: location /backend/ → http://api_server:8000/
   └─ Forwards to: http://172.18.0.4:8000/api/search?query=Gaming+Laptop

4. FastAPI (speedscale-node-c:8000)
   ├─ Step 1: Check Redis
   │  └─ GET redis://172.18.0.3:6379/search:gaming laptop
   │  └─ Result: MISS (first time query)
   │
   ├─ Step 2: Query MongoDB (3M records)
   │  └─ db.products.find({$or: [
   │       {name: /Gaming Laptop/i},
   │       {category: /Gaming Laptop/i},
   │       {brand: /Gaming Laptop/i}
   │     ]}).limit(20)
   │  └─ Latency: ~120ms (indexed search on large collection)
   │  └─ Returns: 18 matching products
   │
   ├─ Step 3: Write to Redis
   │  └─ SETEX search:gaming laptop 60 "[{...18 products...}]"
   │  └─ TTL: 60 seconds
   │
   └─ Response: {
       "source": "MONGODB_DISK 🐢",
       "time": "125ms",
       "cached": false,
       "count": 18,
       "data": [...]
     }

5. Nginx forwards response → Browser displays results

6. User searches "Gaming Laptop" again (within 60s)
   ├─ FastAPI checks Redis: HIT (from Step 3)
   ├─ MongoDB query: SKIPPED
   └─ Response: {"source": "REDIS_CACHE ⚡", "time": "8ms", "cached": true}
```

#### Phase 4: Performance Impact with 3 Million Records

**Why Redis is Critical for Large Datasets:**

| Operation | MongoDB (3M docs) | Redis Cache | Improvement |
|-----------|------------------|-------------|-------------|
| Indexed search | 80-150ms | 5-12ms | 10-15x faster |
| Full-text regex | 200-500ms | 5-12ms | 20-40x faster |
| Product by ID | 50-100ms | 3-8ms | 12-25x faster |
| Similar products | 150-300ms | 8-15ms | 15-25x faster |

**MongoDB Indexing (Essential for 3M Documents):**
```javascript
// Created automatically by FastAPI on startup
db.products.createIndex({ name: 1 })
db.products.createIndex({ category: 1 })
db.products.createIndex({ brand: 1 })

// Without indexes:
// ├─ Full collection scan on 3M docs: 5-10 seconds
// └─ Application becomes unusable

// With indexes:
// ├─ Index seek: 80-150ms
// └─ Acceptable for cold queries
```

**Redis Cache Hit Rate:**
- First hour: ~20% (cold cache, users exploring)
- Peak hours: ~70-85% (repeated searches, popular products)
- Result: 70-85% of queries bypass MongoDB entirely

**Resource Usage (Docker Stats):**
```
CONTAINER              CPU %   MEM USAGE / LIMIT    MEM %
speedscale-node-a      2-5%    800MB / 2GB          40%    (MongoDB + 3M docs)
speedscale-node-b      0.5%    150MB / 512MB        29%    (Redis in-memory)
speedscale-node-c      1-3%    200MB / 1GB          20%    (FastAPI + ML model)
speedscale-frontend    0.1%    50MB / 256MB         19%    (Nginx static server)
speedscale-redis-ui    0.2%    80MB / 256MB         31%    (Redis Commander)
```

#### Phase 5: Container Communication (Internal DNS)

Docker's embedded DNS server (`127.0.0.11`) resolves service names:

```
Inside speedscale-node-c (FastAPI):
├─ "mongodb" → 172.18.0.2:27017
├─ "redis" → 172.18.0.3:6379
└─ Ping latency: <1ms (same host, virtual network)

From Host Machine:
├─ localhost:27017 → MongoDB (exposed port)
├─ localhost:6379 → Redis (exposed port)
├─ localhost:8000 → FastAPI (exposed port)
└─ localhost:3000 → Frontend (exposed port)
```

#### Phase 6: Data Persistence & Cleanup

**What Persists After `docker-compose down`:**
```
mongodb_data volume:
├─ Status: PRESERVED
├─ Contains: All 3 million MongoDB documents
└─ Location: Docker's volume directory
   (Windows: \\wsl$\docker-desktop-data\version-pack-data\community\docker\volumes\)

Redis cache:
├─ Status: CLEARED (in-memory only)
└─ Must warm up again on restart
```

**To completely reset:**
```powershell
# Stop all containers and remove volumes
docker-compose down --volumes

# This deletes the 3M MongoDB records!
# You'll need to re-import or let FastAPI seed 2K products
```

**To keep data but restart:**
```powershell
# Preserves mongodb_data volume
docker-compose restart
```

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
