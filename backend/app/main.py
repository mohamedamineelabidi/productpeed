import asyncio
import json
import logging
import os
import random
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from faker import Faker
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from redis.asyncio import Redis

from .ml.recommender import ProductRecommender

API_PORT = int(os.getenv("API_PORT", "8000"))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/speedscale")
MONGO_DB = os.getenv("MONGO_DB", "speedscale")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "products")
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
AUTO_SEED = os.getenv("AUTO_SEED", "true").lower() in {"1", "true", "yes", "on"}
SEED_TARGET = int(os.getenv("SEED_TARGET", "2000"))
SEED_BATCH_SIZE = int(os.getenv("SEED_BATCH_SIZE", "400"))


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("speedscale.fastapi")


mongo_client: Optional[AsyncIOMotorClient] = None
mongo_collection: Optional[AsyncIOMotorCollection] = None
redis_client: Optional[Redis] = None
db_status = {"mongo": False, "redis": False}
seed_lock = asyncio.Lock()
seed_completed = False
faker = Faker()
ml_engine = ProductRecommender()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_mongo_client()
    await asyncio.gather(check_mongo_connection(), check_redis_connection())

    print("\n" + "=" * 50)
    print("🚀 SPEEDSCALE GATEWAY STARTED")
    print(f"📡 MongoDB Status: {'✅ CONNECTED' if db_status['mongo'] else '❌ FAILED'}")
    print(f"⚡ Redis Status:   {'✅ CONNECTED' if db_status['redis'] else '❌ FAILED (Cache Disabled)'}")
    if not db_status['redis']:
        print("   ⚠️  Make sure Redis is running on localhost:6379")
    print("=" * 50 + "\n")

    if db_status["mongo"]:
        await seed_database_if_needed()

    yield

    if mongo_client:
        mongo_client.close()
    await reset_redis_client()


app = FastAPI(
    title="SpeedScale FastAPI Gateway",
    version="1.0.0",
    description="Gateway node that fronts MongoDB (Cold) and Redis (Hot) storage tiers.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_mongo_client() -> None:
    global mongo_client, mongo_collection
    if mongo_client is None:
        mongo_client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=2000)
        mongo_collection = mongo_client[MONGO_DB][MONGO_COLLECTION]


def build_redis_client() -> Redis:
    return Redis.from_url(
        REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def format_latency(start_time: float) -> str:
    elapsed = int((time.perf_counter() - start_time) * 1000)
    return f"{max(elapsed, 0)}ms"


def normalize_product(doc: Dict[str, Any]) -> Dict[str, Any]:
    created = doc.get("createdAt", datetime.utcnow())
    if isinstance(created, datetime):
        created_iso = created.isoformat()
    else:
        created_iso = str(created)

    return {
        "_id": str(doc.get("_id")),
        "name": doc.get("name", ""),
        "price": float(doc.get("price", 0.0)),
        "description": doc.get("description", ""),
        "category": doc.get("category", ""),
        "brand": doc.get("brand", ""),
        "inStock": bool(doc.get("inStock", True)),
        "rating": float(doc.get("rating", 0.0)),
        "imageUrl": doc.get("imageUrl", "https://picsum.photos/seed/placeholder/400/300"),
        "createdAt": created_iso,
    }


def generate_mock_products(query: str, count: int = 8) -> List[Dict[str, Any]]:
    base = query.strip() or "Product"
    tiers = ["Pro", "Elite", "Plus", "Lite", "Studio", "Max"]
    categories = [
        "Electronics",
        "Computers",
        "Accessories",
        "Home Office",
        "Audio",
        "Gaming",
    ]
    brands = [
        "SpeedScale Labs",
        "ApexWare",
        "FutureCore",
        "BlueSky Systems",
        "Northwind Digital",
    ]

    items: List[Dict[str, Any]] = []
    for idx in range(count):
        items.append(
            {
                "_id": f"fallback-{idx}-{int(time.time() * 1000)}",
                "name": f"{base} {tiers[idx % len(tiers)]}",
                "price": round(random.uniform(50, 1200), 2),
                "description": "This result is served from in-memory fallback data because the primary database is offline.",
                "category": categories[idx % len(categories)],
                "brand": random.choice(brands),
                "inStock": True,
                "rating": round(random.uniform(3.5, 5.0), 1),
                "imageUrl": f"https://picsum.photos/seed/{base.replace(' ', '')}{idx}/400/300",
                "createdAt": now_iso(),
            }
        )
    return items


def generate_mock_product_by_id(product_id: str) -> Dict[str, Any]:
    return {
        "_id": product_id,
        "name": f"SpeedScale Memory {product_id[-6:]}" if len(product_id) >= 6 else "SpeedScale Memory SKU",
        "price": round(random.uniform(199, 499), 2),
        "description": "This product was generated from the gateway cache to keep the UI responsive while MongoDB is unavailable.",
        "category": "Memory Fallback",
        "brand": "SpeedScale Edge",
        "inStock": True,
        "rating": 4.7,
        "imageUrl": f"https://picsum.photos/seed/{product_id}/800/600",
        "createdAt": now_iso(),
    }


async def get_redis_client() -> Optional[Redis]:
    global redis_client
    if redis_client is None:
        redis_client = build_redis_client()
    return redis_client


async def reset_redis_client() -> None:
    global redis_client
    if redis_client is not None:
        try:
            await redis_client.close()
        except Exception:
            pass
    redis_client = None


async def read_cache(key: str) -> Optional[Any]:
    client = await get_redis_client()
    if not client:
        return None
    try:
        cached = await client.get(key)
        db_status["redis"] = True
        if cached is None:
            return None
        return json.loads(cached)
    except Exception as exc:
        db_status["redis"] = False
        logger.debug("Redis read failed for %s: %s", key, exc)
        await reset_redis_client()
    return None


async def write_cache(key: str, payload: Any, ttl_seconds: int) -> None:
    client = await get_redis_client()
    if not client:
        return
    try:
        await client.setex(key, ttl_seconds, json.dumps(payload))
        db_status["redis"] = True
    except Exception as exc:
        db_status["redis"] = False
        logger.debug("Redis write failed for %s: %s", key, exc)
        await reset_redis_client()


async def check_mongo_connection() -> bool:
    if not mongo_client:
        return False
    try:
        await mongo_client.admin.command("ping")
        db_status["mongo"] = True
        return True
    except Exception as exc:
        db_status["mongo"] = False
        logger.warning("MongoDB ping failed: %s", exc)
        return False


async def check_redis_connection() -> bool:
    client = await get_redis_client()
    if not client:
        return False
    try:
        await client.ping()
        db_status["redis"] = True
        return True
    except Exception as exc:
        db_status["redis"] = False
        logger.debug("Redis ping failed: %s", exc)
        await reset_redis_client()
        return False


async def rate_limiter(request: Request):
    client = await get_redis_client()
    if not client:
        return

    client_ip = request.client.host if request.client else "unknown"
    key = f"rate_limit:{client_ip}"

    try:
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, 60)

        if count > 60:
            raise HTTPException(status_code=429, detail="Too Many Requests")
    except Exception as exc:
        logger.debug("Rate limiter error: %s", exc)


async def record_search_trend(query: str):
    client = await get_redis_client()
    if not client:
        return
    try:
        await client.lpush("global:searches", query)
        await client.ltrim("global:searches", 0, 19)
    except Exception as exc:
        logger.debug("Failed to record trend: %s", exc)


async def ensure_indexes() -> None:
    if mongo_collection is None:
        return
    try:
        await mongo_collection.create_index("name")
        await mongo_collection.create_index("category")
        await mongo_collection.create_index("brand")
    except Exception as exc:
        logger.debug("Index creation skipped: %s", exc)


async def seed_database_if_needed() -> None:
    global seed_completed
    if seed_completed or not AUTO_SEED or mongo_collection is None:
        return

    async with seed_lock:
        if seed_completed:
            return

        try:
            existing = await mongo_collection.estimated_document_count()
        except Exception as exc:
            logger.warning("Unable to count products: %s", exc)
            return

        if existing >= SEED_TARGET:
            seed_completed = True
            logger.info("MongoDB already contains %s products. Skipping seed.", existing)
            return

        logger.info("Seeding MongoDB with %s products", SEED_TARGET)
        created = existing
        success = True
        while created < SEED_TARGET:
            batch_size = min(SEED_BATCH_SIZE, SEED_TARGET - created)
            docs = []
            for _ in range(batch_size):
                docs.append(
                    {
                        "name": faker.catch_phrase(),
                        "price": round(random.uniform(20, 2500), 2),
                        "description": faker.paragraph(nb_sentences=3),
                        "category": faker.random_element(
                            [
                                "Electronics",
                                "Computers",
                                "Accessories",
                                "Home Office",
                                "Audio",
                                "Gaming",
                            ]
                        ),
                        "brand": faker.company(),
                        "inStock": faker.pybool(),
                        "rating": round(random.uniform(1.5, 5.0), 1),
                        "imageUrl": f"https://picsum.photos/seed/{faker.random_int()}/400/300",
                        "createdAt": datetime.utcnow(),
                    }
                )
            try:
                await mongo_collection.insert_many(docs)
                created += len(docs)
                logger.info("Seed progress: %s/%s", created, SEED_TARGET)
            except Exception as exc:
                logger.error("Failed to insert seed batch: %s", exc)
                success = False
                break

        if success and created >= SEED_TARGET:
            await ensure_indexes()
            seed_completed = True
        else:
            logger.warning("Seed process did not reach target. Current count: %s", created)


@app.get("/")
async def root() -> Dict[str, str]:
    return {"message": "SpeedScale FastAPI Gateway is running"}


@app.get("/health")
async def health() -> Dict[str, Any]:
    await asyncio.gather(check_mongo_connection(), check_redis_connection())
    return {
        "status": "healthy" if any(db_status.values()) else "degraded",
        "timestamp": now_iso(),
        "connections": {
            "mongodb": db_status["mongo"],
            "redis": db_status["redis"],
        },
        "servers": {
            "this_server": "Backend API (FastAPI)",
            "mongodb": "Connected" if db_status["mongo"] else "Offline",
            "redis": "Connected" if db_status["redis"] else "Offline",
        },
    }


@app.get("/api/search")
async def search_products(
    request: Request,
    query: str = Query(..., min_length=1, max_length=100),
    _: Any = Depends(rate_limiter),
) -> Dict[str, Any]:
    start = time.perf_counter()
    cleaned_query = query.strip()
    if not cleaned_query:
        raise HTTPException(status_code=400, detail="Query required")

    await record_search_trend(cleaned_query)

    cache_key = f"search:{cleaned_query.lower()}"
    cached_payload = await read_cache(cache_key)
    if cached_payload is not None:
        return {
            "source": "REDIS_CACHE ⚡ (Python)",
            "time": format_latency(start),
            "cached": True,
            "count": len(cached_payload),
            "data": cached_payload,
        }

    products: List[Dict[str, Any]] = []
    source = ""
    mongo_available = False

    if mongo_collection is not None:
        try:
            cursor = mongo_collection.find(
                {
                    "$or": [
                        {"name": {"$regex": cleaned_query, "$options": "i"}},
                        {"category": {"$regex": cleaned_query, "$options": "i"}},
                        {"brand": {"$regex": cleaned_query, "$options": "i"}},
                    ]
                }
            ).limit(20)
            docs = await cursor.to_list(length=20)
            products = [normalize_product(doc) for doc in docs]
            source = "MONGODB_DISK 🐢 (Python)"
            db_status["mongo"] = True
            mongo_available = True
        except Exception as exc:
            db_status["mongo"] = False
            logger.warning("Mongo search failed: %s", exc)

    if not mongo_available:
        await asyncio.sleep(0.05)
        products = generate_mock_products(cleaned_query)
        source = "BACKEND_MEMORY ⚠️ (DB Offline)"

    if mongo_available and products:
        await write_cache(cache_key, products, ttl_seconds=60)

    return {
        "source": source or "UNKNOWN",
        "time": format_latency(start),
        "cached": False,
        "count": len(products),
        "data": products,
    }


@app.get("/api/trending")
async def get_trending_searches() -> List[str]:
    client = await get_redis_client()
    if not client:
        return []
    try:
        return await client.lrange("global:searches", 0, -1)
    except Exception:
        return []


@app.get("/api/products/{product_id}")
async def get_product(product_id: str) -> Dict[str, Any]:
    start = time.perf_counter()
    cache_key = f"product:{product_id}"

    cached_product = await read_cache(cache_key)
    if cached_product is not None:
        return {
            "source": "REDIS_CACHE ⚡ (Python)",
            "time": format_latency(start),
            "cached": True,
            "data": cached_product,
        }

    product: Optional[Dict[str, Any]] = None
    mongo_error = False

    if mongo_collection is not None:
        try:
            oid = ObjectId(product_id)
            doc = await mongo_collection.find_one({"_id": oid})
            db_status["mongo"] = True
            if doc:
                product = normalize_product(doc)
        except InvalidId:
            pass
        except Exception as exc:
            db_status["mongo"] = False
            mongo_error = True
            logger.warning("Mongo product lookup failed: %s", exc)

    if not product:
        if not db_status["mongo"] or mongo_error:
            await asyncio.sleep(0.03)
            product = generate_mock_product_by_id(product_id)
            source = "BACKEND_MEMORY ⚠️ (DB Offline)"
        else:
            raise HTTPException(status_code=404, detail="Product not found")
    else:
        source = "MONGODB_DISK 🐢 (Python)"
        await write_cache(cache_key, product, ttl_seconds=300)

    return {
        "source": source,
        "time": format_latency(start),
        "cached": False,
        "data": product,
    }


@app.get("/api/products/{product_id}/similar")
async def get_similar_products(product_id: str) -> Dict[str, Any]:
    start = time.perf_counter()
    cache_key = f"similar:{product_id}"

    cached = await read_cache(cache_key)
    if cached is not None:
        return {
            "source": "REDIS_CACHE ⚡ (Python)",
            "time": format_latency(start),
            "cached": True,
            "data": cached,
        }

    products: List[Dict[str, Any]] = []
    source = ""
    mongo_available = False

    if mongo_collection is not None:
        try:
            oid = ObjectId(product_id)
            origin = await mongo_collection.find_one({"_id": oid})
            db_status["mongo"] = True
            if origin:
                text_features = f"{origin.get('name', '')} {origin.get('description', '')}"

                similar_ids = ml_engine.find_similar_products(text_features, limit=4)

                if similar_ids:
                    cursor = mongo_collection.find({"_id": {"$in": [ObjectId(i) for i in similar_ids]}})
                    source = "ML_ENGINE 🤖"
                else:
                    cursor = mongo_collection.find(
                        {
                            "category": origin.get("category"),
                            "_id": {"$ne": oid},
                        }
                    ).limit(4)
                    source = "MONGODB_QUERY 🐢"

                docs = await cursor.to_list(length=4)
                products = [normalize_product(doc) for doc in docs]
                mongo_available = True
        except InvalidId:
            pass
        except Exception as exc:
            db_status["mongo"] = False
            logger.warning("Mongo similar lookup failed: %s", exc)

    if not products:
        products = generate_mock_products("Similar", count=4)
        source = "BACKEND_MEMORY ⚠️" if not mongo_available else "MONGODB_FALLBACK"

    await write_cache(cache_key, products, ttl_seconds=120)

    return {
        "source": source,
        "time": format_latency(start),
        "cached": False,
        "data": products,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=API_PORT, reload=True)
