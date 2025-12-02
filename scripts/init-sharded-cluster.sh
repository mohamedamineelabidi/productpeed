#!/bin/bash

echo "============================================"
echo "🚀 INITIALIZING MONGODB SHARDED CLUSTER"
echo "============================================"

# Wait for all services to be ready
echo "⏳ Waiting for all MongoDB nodes to start..."
sleep 15

# ================================
# STEP 1: Initialize Config Server Replica Set
# ================================
echo ""
echo "📌 Step 1: Initializing Config Server Replica Set..."
mongosh --host config-server-1:27017 --eval '
rs.initiate({
  _id: "configReplSet",
  configsvr: true,
  members: [
    { _id: 0, host: "config-server-1:27017" },
    { _id: 1, host: "config-server-2:27017" },
    { _id: 2, host: "config-server-3:27017" }
  ]
})
'

echo "⏳ Waiting for config replica set election..."
sleep 10

# ================================
# STEP 2: Initialize Shard 1 Replica Set
# ================================
echo ""
echo "📌 Step 2: Initializing Shard 1 Replica Set..."
mongosh --host shard1-node1:27017 --eval '
rs.initiate({
  _id: "shard1ReplSet",
  members: [
    { _id: 0, host: "shard1-node1:27017" },
    { _id: 1, host: "shard1-node2:27017" },
    { _id: 2, host: "shard1-node3:27017" }
  ]
})
'

echo "⏳ Waiting for shard 1 replica set election..."
sleep 10

# ================================
# STEP 3: Initialize Shard 2 Replica Set
# ================================
echo ""
echo "📌 Step 3: Initializing Shard 2 Replica Set..."
mongosh --host shard2-node1:27017 --eval '
rs.initiate({
  _id: "shard2ReplSet",
  members: [
    { _id: 0, host: "shard2-node1:27017" },
    { _id: 1, host: "shard2-node2:27017" },
    { _id: 2, host: "shard2-node3:27017" }
  ]
})
'

echo "⏳ Waiting for shard 2 replica set election..."
sleep 10

# ================================
# STEP 4: Add Shards to Cluster
# ================================
echo ""
echo "📌 Step 4: Adding shards to the cluster via mongos..."
mongosh --host mongos:27017 --eval '
sh.addShard("shard1ReplSet/shard1-node1:27017,shard1-node2:27017,shard1-node3:27017");
sh.addShard("shard2ReplSet/shard2-node1:27017,shard2-node2:27017,shard2-node3:27017");
'

sleep 5

# ================================
# STEP 5: Enable Sharding on Database
# ================================
echo ""
echo "📌 Step 5: Enabling sharding on 'speedscale' database..."
mongosh --host mongos:27017 --eval '
sh.enableSharding("speedscale");
'

# ================================
# STEP 6: Shard the Products Collection
# ================================
echo ""
echo "📌 Step 6: Sharding the 'products' collection..."
mongosh --host mongos:27017 --eval '
use speedscale;

// Create indexes for sharding
db.products.createIndex({ _id: "hashed" });
db.products.createIndex({ category: 1 });
db.products.createIndex({ name: 1 });
db.products.createIndex({ brand: 1 });

// Shard the collection on _id (hashed for even distribution)
sh.shardCollection("speedscale.products", { _id: "hashed" });
'

sleep 5

# ================================
# STEP 7: Verify Cluster Status
# ================================
echo ""
echo "============================================"
echo "✅ CLUSTER INITIALIZATION COMPLETE"
echo "============================================"
echo ""
echo "📊 Cluster Status:"
mongosh --host mongos:27017 --eval 'sh.status()'

echo ""
echo "🎉 Sharded cluster is ready!"
echo "   - Mongos router: mongos:27017"
echo "   - Config servers: 3 nodes"
echo "   - Shards: 2 replica sets (3 nodes each)"
echo "   - Database: speedscale"
echo "   - Sharded collection: products"
echo ""
echo "🔗 Connect your API with:"
echo "   MONGO_URI=mongodb://mongos:27017/speedscale"
echo "============================================"
