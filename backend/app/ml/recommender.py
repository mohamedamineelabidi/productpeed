import os
import pickle
from typing import List


class ProductRecommender:
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.product_ids: List[str] = []

        base_path = os.path.dirname(os.path.abspath(__file__))
        artifacts_path = os.path.join(base_path, "artifacts")

        try:
            with open(os.path.join(artifacts_path, "vectorizer.pkl"), "rb") as f:
                self.vectorizer = pickle.load(f)
            with open(os.path.join(artifacts_path, "model.pkl"), "rb") as f:
                self.model = pickle.load(f)
            with open(os.path.join(artifacts_path, "product_ids.pkl"), "rb") as f:
                self.product_ids = pickle.load(f)
            print("ML Model loaded successfully ✅")
        except FileNotFoundError:
            print("⚠️ ML Artifacts not found. Please run training.ipynb first.")

    def find_similar_products(self, product_text: str, limit: int = 4) -> List[str]:
        if not self.model or not self.vectorizer:
            return []

        try:
            query_vec = self.vectorizer.transform([product_text])
            distances, indices = self.model.kneighbors(query_vec, n_neighbors=limit + 1)

            similar_ids: List[str] = []
            for idx in indices[0]:
                if idx < len(self.product_ids):
                    similar_ids.append(self.product_ids[idx])

            return similar_ids
        except Exception as exc:
            print(f"Error during ML inference: {exc}")
            return []
