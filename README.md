# 教学解题 Agent

一个面向初高中场景的教学式解题系统，支持文本/图片输入、分步讲解、LaTeX 渲染、追问、多解法、流式返回，以及后续步骤预取。

## 当前状态

- 可用：提交题目、自动生成首步、继续分步解题、聊天追问、知识点总结、繁忙提示、流式渲染
- 已补齐：日志、并发控制、任务队列、SSE 心跳、模型超时、步骤预取、会话持久化、后端测试、前端 E2E
- 默认模型：`qwen3.6-plus`（DashScope OpenAI 兼容接口）

## 目录结构

```text
backend/
  agent.py            核心解题与预取逻辑
  main.py             FastAPI API
  models.py           Pydantic 模型
  queue_manager.py    并发与队列控制
  log_config.py       日志配置
  skills/prompts.py   系统提示词
  tests/              后端测试
frontend/
  src/                React 前端
  e2e/                Playwright E2E
start.sh              一键启动脚本
```

## 运行要求

- Python 3.9+
- Node.js 24.x
- `backend/venv` 已安装依赖
- `frontend/node_modules` 已安装依赖

## 快速启动

根目录执行：

```bash
./start.sh
```

启动后：

- 前端：[http://localhost:5173](http://localhost:5173)
- 后端：[http://localhost:8000](http://localhost:8000)
- 健康检查：[http://localhost:8000/health](http://localhost:8000/health)

## 环境配置

配置文件在 [backend/.env](/Users/hpc/Documents/education_agent/backend/.env)，示例在 [backend/.env.example](/Users/hpc/Documents/education_agent/backend/.env.example)。

关键参数：

- `API_TYPE`
  - `openai` 或 `anthropic`
- `MODEL`
  - 当前使用的模型名
- `OPENAI_API_BASE_URL`
  - OpenAI 兼容端点
- `OPENAI_ENABLE_THINKING`
  - 默认 `false`
  - 建议保持关闭，减少首包时延
- `PREFETCH_STEPS`
  - 预取后续步骤数
  - `0` 关闭预取，`1` 表示预取 1 步
- `PERSIST_SESSIONS`
  - `true` 时会把会话写到磁盘
- `SESSION_STORE_PATH`
  - 默认 `data/sessions.json`

## 系统行为

### 1. 自动首步

提交题目后，前端会自动触发第一步生成，不需要先点一次“下一步”。

### 2. 流式返回

后端通过 SSE 持续推送模型输出。

- 正常文本块：`data: {"chunk": "..."}`
- 完成帧：`data: {"step": {...}, "done": true}`
- 繁忙帧：`data: {"busy": true, "error": "..."}`
- 心跳：`: ping`

### 3. 并发与队列

默认参数在 [backend/queue_manager.py](/Users/hpc/Documents/education_agent/backend/queue_manager.py)：

- 最大并发：`4`
- 最大队列：`12`

当队列已满时，前端会收到繁忙提示，而不是无响应卡死。

### 4. 预取策略

当用户看到当前步骤后，后端会在有空闲执行槽位时预取后续步骤。

- 预取只占空闲槽位
- 没空闲时直接跳过，不阻塞用户请求
- 聊天追问、换解法、总结等上下文变化会自动使旧预取失效

### 5. 会话持久化

启用 `PERSIST_SESSIONS=true` 后：

- 会话会写入 `SESSION_STORE_PATH`
- 服务重启后会自动恢复
- 恢复时只还原稳定状态，不恢复运行中的预取任务

## API

主要接口：

- `POST /api/solve`
  - 创建解题会话
- `GET /api/next-step/{session_id}`
  - 获取下一步，SSE
- `POST /api/chat`
  - 聊天追问，SSE
- `GET /api/session/{session_id}`
  - 查看当前会话状态
- `GET /api/queue`
  - 查看队列和运行时统计
- `GET /health`
  - 健康检查 + 运行状态

## 测试

### 后端

```bash
cd backend
./venv/bin/pytest -q
```

### 前端构建

```bash
cd frontend
npm run build
```

### 前端 E2E

先启动前后端，再执行：

```bash
cd frontend
npx playwright test
```

## 当前验证结果

- 后端测试：`36` 项通过
- 前端 E2E：`12` 项通过

## 已知边界

- 会话目前持久化到本地 JSON 文件，不是数据库方案
- `frontend/node_modules` 与 `backend/venv` 当前直接位于项目目录
- 前端生产包体仍偏大，构建会有 chunk size warning
- 多进程部署下，会话文件需要改成共享存储或数据库

## 建议的后续演进

如果后面继续迭代，优先级建议是：

1. 把本地 JSON 会话存储升级为数据库
2. 给预取增加命中率、耗时、成本统计
3. 做前端分包和静态资源优化
4. 增加登录、用户隔离、会话清理策略
