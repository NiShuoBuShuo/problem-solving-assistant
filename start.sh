#!/bin/bash
# 教学解题 Agent 启动脚本

set -e
cd "$(dirname "$0")"

# ── 加载 backend/.env ────────────────────────────────────
if [ -f backend/.env ]; then
  export $(grep -v '^\s*#' backend/.env | grep -v '^\s*$' | xargs) 2>/dev/null || true
fi

# ── 统一 base url 变量（兼容两种写法）────────────────────
API_BASE_URL="${API_BASE_URL:-$OPENAI_API_BASE_URL}"
API_TYPE="${API_TYPE:-anthropic}"
MODEL="${MODEL:-claude-sonnet-4-6}"

# ── 校验：配置了 OpenAI 兼容接口的模型 OR Anthropic 接口的模型 ──
openai_ok=false
anthropic_ok=false

if [ "$API_TYPE" = "openai" ]; then
  KEY="${OPENAI_API_KEY:-$ANTHROPIC_API_KEY}"
  if [ -n "$KEY" ] && [ -n "$API_BASE_URL" ] && [ -n "$MODEL" ]; then
    openai_ok=true
  fi
fi

if [ "$API_TYPE" = "anthropic" ]; then
  if [ -n "$ANTHROPIC_API_KEY" ] && [ -n "$MODEL" ]; then
    anthropic_ok=true
  fi
fi

if [ "$openai_ok" = false ] && [ "$anthropic_ok" = false ]; then
  echo "❌ 未找到有效的模型配置，请检查 backend/.env："
  echo ""
  if [ "$API_TYPE" = "openai" ]; then
    echo "  OpenAI 兼容模式需要："
    echo "    API_TYPE=openai"
    echo "    MODEL=<模型名>              当前: ${MODEL:-（未设置）}"
    echo "    OPENAI_API_KEY=<key>        当前: ${OPENAI_API_KEY:+已设置}${OPENAI_API_KEY:-（未设置）}"
    echo "    API_BASE_URL=<端点>         当前: ${API_BASE_URL:-（未设置）}"
  else
    echo "  Anthropic 模式需要："
    echo "    API_TYPE=anthropic"
    echo "    MODEL=<模型名>              当前: ${MODEL:-（未设置）}"
    echo "    ANTHROPIC_API_KEY=<key>     当前: ${ANTHROPIC_API_KEY:+已设置}${ANTHROPIC_API_KEY:-（未设置）}"
  fi
  echo ""
  echo "  参考 backend/.env.example"
  exit 1
fi

# ── 打印当前配置 ─────────────────────────────────────────
if [ "$openai_ok" = true ]; then
  echo "📡 接口: OpenAI 兼容 | 模型: $MODEL | 端点: $API_BASE_URL"
  echo "🧠 Thinking: ${OPENAI_ENABLE_THINKING:-false}"
else
  echo "📡 接口: Anthropic 官方 | 模型: $MODEL"
fi
echo "⏭️  预取步数: ${PREFETCH_STEPS:-0}"
echo "💾 会话持久化: ${PERSIST_SESSIONS:-true} | 存储: ${SESSION_STORE_PATH:-backend/data/sessions.json}"

export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"

echo ""
echo "🚀 启动后端 (FastAPI @ :8000)..."
cd backend
venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

sleep 2
echo "🎨 启动前端 (Vite @ :5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 已启动："
echo "   前端: http://localhost:5173"
echo "   后端: http://localhost:8000"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '已停止'" EXIT
wait
