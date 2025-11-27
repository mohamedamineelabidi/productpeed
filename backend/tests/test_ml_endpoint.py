import requests

BASE_URL = "http://localhost:8000"

def test_ml_integration() -> None:
    print("🔍 1. Searching for a product to get an ID...")
    try:
        search_resp = requests.get(f"{BASE_URL}/api/search?query=computer")
        search_data = search_resp.json()

        if not search_data.get("data"):
            print("❌ No products found. Seed the database first.")
            return

        first_product = search_data["data"][0]
        product_id = first_product["_id"]
        product_name = first_product["name"]

        print(f"✅ Found Product: {product_name} (ID: {product_id})")
        print("-" * 50)

        print("🤖 2. Asking ML Model for similar products...")
        similar_url = f"{BASE_URL}/api/products/{product_id}/similar"
        similar_resp = requests.get(similar_url)
        similar_data = similar_resp.json()

        source = similar_data.get("source", "UNKNOWN")
        print(f"📊 Response Source: {source}")

        if "ML_ENGINE" in source:
            print("🎉 SUCCESS! The ML Model is working.")
        else:
            print("⚠️ WARNING: The response came from MongoDB/Fallback, not the ML Engine.")
            print("Did you restart the backend after training?")

        print("-" * 50)
        print("Recommended Products:")
        for item in similar_data.get("data", []):
            print(f" - {item['name']} ({item['_id']})")

    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend. Is it running on port 8000?")

if __name__ == "__main__":
    test_ml_integration()
