# SpeedScale Sharded Cluster - Windows Quick Start Script
# Run this in PowerShell: .\scripts\start-sharded-cluster.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🚀 SPEEDSCALE SHARDED CLUSTER STARTER" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "🔍 Checking Docker status..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running!" -ForegroundColor Red
    Write-Host "   Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker is running" -ForegroundColor Green

# Stop existing containers if any
Write-Host ""
Write-Host "🧹 Cleaning up existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose-sharded.yml down 2>&1 | Out-Null

# Start the cluster
Write-Host ""
Write-Host "🚀 Starting sharded cluster (15 containers)..." -ForegroundColor Yellow
Write-Host "   This will take 60-90 seconds..." -ForegroundColor Gray
docker-compose -f docker-compose-sharded.yml up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start cluster!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ All containers started" -ForegroundColor Green

# Monitor initialization
Write-Host ""
Write-Host "⏳ Waiting for cluster initialization..." -ForegroundColor Yellow
Write-Host "   (Initializing replica sets and adding shards)" -ForegroundColor Gray
Start-Sleep -Seconds 5

# Follow init logs
Write-Host ""
Write-Host "📋 Initialization logs:" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
docker logs -f cluster-init 2>&1 | ForEach-Object {
    if ($_ -match "CLUSTER INITIALIZATION COMPLETE") {
        Write-Host $_ -ForegroundColor Green
        break
    } elseif ($_ -match "Error|Failed") {
        Write-Host $_ -ForegroundColor Red
    } elseif ($_ -match "Step \d") {
        Write-Host $_ -ForegroundColor Yellow
    } else {
        Write-Host $_
    }
}

# Wait for API to be ready
Write-Host ""
Write-Host "⏳ Waiting for API server to start..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$apiReady = $false

while ($attempt -lt $maxAttempts) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 2 -UseBasicParsing 2>&1
        if ($response.StatusCode -eq 200) {
            $apiReady = $true
            break
        }
    } catch {
        # API not ready yet
    }
    Start-Sleep -Seconds 2
    $attempt++
    Write-Host "." -NoNewline -ForegroundColor Gray
}

Write-Host ""

if ($apiReady) {
    Write-Host "✅ API server is ready" -ForegroundColor Green
} else {
    Write-Host "⚠️  API server is taking longer than expected" -ForegroundColor Yellow
    Write-Host "   Check logs: docker logs cluster-api-gateway" -ForegroundColor Gray
}

# Display cluster status
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ CLUSTER IS READY!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 Cluster Architecture:" -ForegroundColor White
Write-Host "   • Config Servers:  3 nodes" -ForegroundColor Gray
Write-Host "   • Shard 1:         3 nodes (replica set)" -ForegroundColor Gray
Write-Host "   • Shard 2:         3 nodes (replica set)" -ForegroundColor Gray
Write-Host "   • Mongos Router:   1 node" -ForegroundColor Gray
Write-Host "   • Redis Cache:     1 node + UI" -ForegroundColor Gray
Write-Host "   • API Gateway:     1 node (FastAPI)" -ForegroundColor Gray
Write-Host "   • Frontend:        1 node (React + Nginx)" -ForegroundColor Gray

Write-Host ""
Write-Host "🌐 Access Points:" -ForegroundColor White
Write-Host "   Frontend:        http://localhost:3000" -ForegroundColor Cyan
Write-Host "   API Docs:        http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "   API Health:      http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "   RedisInsight:    http://localhost:8001" -ForegroundColor Cyan
Write-Host "   Redis Commander: http://localhost:8081" -ForegroundColor Cyan
Write-Host "   Mongos Router:   mongodb://localhost:27017/speedscale" -ForegroundColor Cyan

Write-Host ""
Write-Host "🔍 Useful Commands:" -ForegroundColor White
Write-Host "   View logs:       docker logs -f cluster-api-gateway" -ForegroundColor Gray
Write-Host "   Cluster status:  docker exec -it cluster-mongos-router mongosh --eval 'sh.status()'" -ForegroundColor Gray
Write-Host "   Stop cluster:    docker-compose -f docker-compose-sharded.yml stop" -ForegroundColor Gray
Write-Host "   Restart cluster: docker-compose -f docker-compose-sharded.yml restart" -ForegroundColor Gray

Write-Host ""
Write-Host "🎉 Happy coding with SpeedScale Sharded Cluster!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
