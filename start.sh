#!/bin/bash
# 教学解题 Agent 一键启动脚本
# 依赖：conda 环境 education-agent 已创建，pnpm 已安装

set -e
cd "$(dirname "$0")"

# ── 加载 backend/.env ─────────────────────────────────────
if [ ! -f backend/.env ]; then
  echo "❌ 缺少配置文件 backend/.env"
  echo "   请复制 backend/.env.example 并填入密钥："
  echo "   cp backend/.env.example backend/.env"
  exit 1
fi
export $(grep -v '^\s*#' backend/.env | grep -v '^\s*$' | xargs) 2>/dev/null || true

# ── 统一变量 ──────────────────────────────────────────────
API_BASE_URL="${API_BASE_URL:-$OPENAI_API_BASE_URL}"
API_TYPE="${API_TYPE:-anthropic}"
MODEL="${MODEL:-claude-sonnet-4-6}"

# ── 校验配置 ──────────────────────────────────────────────
openai_ok=false
anthropic_ok=false
[ "$API_TYPE" = "openai" ] && [ -n "${OPENAI_API_KEY:-$ANTHROPIC_API_KEY}" ] && [ -n "$API_BASE_URL" ] && [ -n "$MODEL" ] && openai_ok=true
[ "$API_TYPE" = "anthropic" ] && [ -n "$ANTHROPIC_API_KEY" ] && [ -n "$MODEL" ] && anthropic_ok=true

if [ "$openai_ok" = false ] && [ "$anthropic_ok" = false ]; then
  echo "❌ 模型配置不完整，请检查 backend/.env（参考 backend/.env.example）"
  exit 1
fi

# ── 打印配置摘要 ──────────────────────────────────────────
if [ "$openai_ok" = true ]; then
  echo "📡 接口: OpenAI 兼容 | 模型: $MODEL | 端点: $API_BASE_URL"
else
  echo "📡 接口: Anthropic 官方 | 模型: $MODEL"
fi
echo "⏭️  预取步数: ${PREFETCH_STEPS:-0} | 💾 持久化: ${PERSIST_SESSIONS:-true}"

# ── 定位 conda 环境中的 Python ────────────────────────────
CONDA_ENV_NAME="${CONDA_ENV_NAME:-education-agent}"

# 优先使用 conda run（不依赖 shell 激活）
PYTHON=$(conda run -n "$CONDA_ENV_NAME" python -c "import sys; print(sys.executable)" 2>/dev/null) || true

if [ -z "$PYTHON" ]; then
  echo "❌ 找不到 conda 环境 '$CONDA_ENV_NAME'"
  echo "   请先创建环境：conda env create -f environment.yml"
  exit 1
fi

echo "🐍 Python: $PYTHON"

# ── 启动后端 ──────────────────────────────────────────────
echo ""
echo "🚀 启动后端 (FastAPI @ :8000)..."
cd backend
conda run -n "$CONDA_ENV_NAME" uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

sleep 2

# ── 启动前端 ──────────────────────────────────────────────
echo "🎨 启动前端 (Vite @ :5173)..."
cd frontend
pnpm dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 服务已启动："
echo "   前端: http://localhost:5173"
echo "   后端: http://localhost:8000"
echo "   健康: http://localhost:8000/health"
echo ""
echo "按 Ctrl+C 停止全部服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '已停止'" EXIT
wait
