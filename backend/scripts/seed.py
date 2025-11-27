import asyncio
import os
import random
from datetime import datetime

from faker import Faker
from motor.motor_asyncio import AsyncIOMotorClient


MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/speedscale")
MONGO_DB = os.getenv("MONGO_DB", "speedscale")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "products")
TOTAL = int(os.getenv("SEED_TOTAL", "2000"))
BATCH_SIZE = int(os.getenv("SEED_BATCH_SIZE", "500"))


faker = Faker()


async def seed() -> None:
    client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    collection = client[MONGO_DB][MONGO_COLLECTION]

    print("🌱 Connecting to MongoDB...")
    await client.admin.command("ping")
    print("✅ Connected. Clearing previous data...")
    await collection.delete_many({})

    created = 0
    while created < TOTAL:
        batch = []
        batch_target = min(BATCH_SIZE, TOTAL - created)
        for _ in range(batch_target):
            batch.append(
                {
                    "name": faker.catch_phrase(),
                    "price": round(random.uniform(15, 2500), 2),
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
                    "rating": round(random.uniform(1.0, 5.0), 1),
                    "imageUrl": f"https://picsum.photos/seed/{faker.random_int()}/400/300",
                    "createdAt": datetime.utcnow(),
                }
            )

        await collection.insert_many(batch)
        created += len(batch)
        print(f"📦 Inserted {created}/{TOTAL}")

    print("⚡ Creating indexes...")
    await collection.create_index("name")
    await collection.create_index("category")
    await collection.create_index("brand")

    client.close()
    print("✅ Seed complete!")


if __name__ == "__main__":
    try:
        asyncio.run(seed())
    except KeyboardInterrupt:
        print("❌ Seed cancelled by user")
