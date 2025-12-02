# SpeedScale Sharded Cluster - Status Checker
# Run this in PowerShell: .\scripts\check-cluster-status.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🔍 SHARDED CLUSTER STATUS CHECK" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check container status
Write-Host "📦 Container Status:" -ForegroundColor Yellow
Write-Host ""

$containers = @(
    @{Name="cluster-config-1"; Role="Config Server 1"},
    @{Name="cluster-config-2"; Role="Config Server 2"},
    @{Name="cluster-config-3"; Role="Config Server 3"},
    @{Name="cluster-shard1-node1"; Role="Shard 1 Primary"},
    @{Name="cluster-shard1-node2"; Role="Shard 1 Secondary"},
    @{Name="cluster-shard1-node3"; Role="Shard 1 Secondary"},
    @{Name="cluster-shard2-node1"; Role="Shard 2 Primary"},
    @{Name="cluster-shard2-node2"; Role="Shard 2 Secondary"},
    @{Name="cluster-shard2-node3"; Role="Shard 2 Secondary"},
    @{Name="cluster-mongos-router"; Role="Mongos Router"},
    @{Name="cluster-redis-cache"; Role="Redis Cache"},
    @{Name="cluster-redis-ui"; Role="Redis Commander"},
    @{Name="cluster-api-gateway"; Role="API Gateway"},
    @{Name="cluster-frontend"; Role="Frontend"}
)

$runningCount = 0
foreach ($container in $containers) {
    $status = docker inspect -f '{{.State.Status}}' $container.Name 2>&1
    if ($status -eq "running") {
        Write-Host "   ✅ $($container.Role.PadRight(20)) [$($container.Name)]" -ForegroundColor Green
        $runningCount++
    } elseif ($status -match "no such") {
        Write-Host "   ❌ $($container.Role.PadRight(20)) [NOT FOUND]" -ForegroundColor Red
    } else {
        Write-Host "   ⚠️  $($container.Role.PadRight(20)) [$status]" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "   Running: $runningCount / $($containers.Count)" -ForegroundColor Cyan

# Check MongoDB cluster status
Write-Host ""
Write-Host "🗄️  MongoDB Cluster Status:" -ForegroundColor Yellow
Write-Host ""

$mongoStatus = docker exec cluster-mongos-router mongosh --quiet --eval 'sh.status()' 2>&1
if ($LASTEXITCODE -eq 0) {
    # Parse shard info
    if ($mongoStatus -match "shard1ReplSet") {
        Write-Host "   ✅ Shard 1 is active" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Shard 1 is not configured" -ForegroundColor Red
    }
    
    if ($mongoStatus -match "shard2ReplSet") {
        Write-Host "   ✅ Shard 2 is active" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Shard 2 is not configured" -ForegroundColor Red
    }
    
    # Check if speedscale database is sharded
    if ($mongoStatus -match "speedscale") {
        Write-Host "   ✅ Database 'speedscale' is sharded" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Database 'speedscale' not yet sharded" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ Cannot connect to mongos router" -ForegroundColor Red
}

# Check product distribution
Write-Host ""
Write-Host "📊 Data Distribution:" -ForegroundColor Yellow
Write-Host ""

$productCount = docker exec cluster-mongos-router mongosh speedscale --quiet --eval 'db.products.countDocuments()' 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   Total products: $productCount" -ForegroundColor Cyan
    
    if ([int]$productCount -gt 0) {
        # Get distribution details
        $distribution = docker exec cluster-mongos-router mongosh speedscale --quiet --eval 'db.products.getShardDistribution()' 2>&1
        Write-Host ""
        Write-Host "   Distribution across shards:" -ForegroundColor Gray
        Write-Host $distribution -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  No products seeded yet (API will auto-seed on startup)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Cannot check product count" -ForegroundColor Yellow
}

# Check Redis status
Write-Host ""
Write-Host "⚡ Redis Cache Status:" -ForegroundColor Yellow
Write-Host ""

$redisStatus = docker exec cluster-redis-cache redis-cli ping 2>&1
if ($redisStatus -eq "PONG") {
    Write-Host "   ✅ Redis is responding" -ForegroundColor Green
    
    # Check cache keys
    $keyCount = docker exec cluster-redis-cache redis-cli dbsize 2>&1
    if ($keyCount -match "dbsize:(\d+)") {
        Write-Host "   Cached keys: $($Matches[1])" -ForegroundColor Cyan
    }
} else {
    Write-Host "   ❌ Redis is not responding" -ForegroundColor Red
}

# Check API health
Write-Host ""
Write-Host "🌐 API Gateway Status:" -ForegroundColor Yellow
Write-Host ""

try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 5 2>&1
    if ($healthResponse.status -eq "healthy") {
        Write-Host "   ✅ API is healthy" -ForegroundColor Green
        Write-Host "   MongoDB: $($healthResponse.connections.mongodb)" -ForegroundColor Cyan
        Write-Host "   Redis: $($healthResponse.connections.redis)" -ForegroundColor Cyan
    } else {
        Write-Host "   ⚠️  API status: $($healthResponse.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ API is not responding" -ForegroundColor Red
}

# Check Frontend
Write-Host ""
Write-Host "🎨 Frontend Status:" -ForegroundColor Yellow
Write-Host ""

try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing 2>&1
    if ($frontendResponse.StatusCode -eq 200) {
        Write-Host "   ✅ Frontend is accessible at http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Frontend returned status: $($frontendResponse.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Frontend is not responding" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "📋 SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if ($runningCount -eq $containers.Count -and $mongoStatus -match "shard1ReplSet" -and $redisStatus -eq "PONG") {
    Write-Host "✅ Cluster is fully operational!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Ready for production workloads" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some components need attention" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🔧 Recommended actions:" -ForegroundColor White
    
    if ($runningCount -lt $containers.Count) {
        Write-Host "   • Check container logs: docker logs <container-name>" -ForegroundColor Gray
    }
    
    if ($mongoStatus -notmatch "shard1ReplSet") {
        Write-Host "   • Re-run initialization: docker-compose -f docker-compose-sharded.yml restart mongo-init" -ForegroundColor Gray
    }
    
    if ($redisStatus -ne "PONG") {
        Write-Host "   • Restart Redis: docker restart cluster-redis-cache" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
