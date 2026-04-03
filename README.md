# 教学解题 Agent

面向初高中场景的 AI 教学辅导系统。输入题目文字或图片，自动识别学科，逐步引导解题，实时流式渲染公式与图示，支持追问和多解法切换。

> **状态**：实验阶段，个人开发者本地运行。

---

## 页面效果

### 整体布局

界面分为三个区域，固定高度不滚动页面：

```
┌─────────────────────────────────────────────────────────────┐
│  解  教学解题助手  初高中·分步引导·可追问   数学 物理 化学…  │  ← 顶部导航
├───────────────────────┬─────────────────────────────────────┤
│   题目区（上）         │                                     │
│  ┌─────────────────┐  │        解题步骤区                   │
│  │ 粘贴/输入题目    │  │                                     │
│  │ 上传图片（可选） │  │  [学科标签] [题型]                  │
│  │ [开始解题 →]    │  │                                     │
│  └─────────────────┘  │  ┌──────────────────────────────┐  │
├───────────────────────┤  │  📋 题型识别  一元二次方程   │  │
│   对话区（下）         │  │  展开后显示推导内容、公式…    │  │
│  ┌─────────────────┐  │  └──────────────────────────────┘  │
│  │ AI 回复气泡      │  │  ┌──────────────────────────────┐  │
│  │ 用户消息气泡     │  │  │  💡 解题思路  …              │  │
│  │ [快速提问按钮]   │  │  └──────────────────────────────┘  │
│  │ [输入框] [发送]  │  │              ↑ 流式生成中…          │
│  └─────────────────┘  │  ┌──────────────────────────────┐  │
│                        │  │  [下一步 →]                  │  │
│                        │  └──────────────────────────────┘  │
└───────────────────────┴─────────────────────────────────────┘
```

### 题目区

- 文本框：粘贴题目，支持 LaTeX 公式（`$...$`）
- 图片上传：拖拽或点击，支持多张图片
- **渲染预览**按钮：切换原文/LaTeX 渲染视图
- 解题完成后显示题目内容，支持一键"新问题"

### 解题步骤区

每一步以卡片形式依次出现，卡片包含：

```
┌─ 步骤卡片 ──────────────────────────────────────────┐
│ 🎯  [题型标签] [解法标签（多解法时）]               │
│     步骤标题（点击展开/折叠）              [完成 ✓] │
├─────────────────────────────────────────────────────┤
│  核心答案                                           │  ← 绿色高亮块（key_point）
│  ─────────────────────────────────────────────────  │
│  说明文字（Markdown + LaTeX 公式渲染）              │
│                                                     │
│  [详细过程 ▼]   ← 可折叠的推导细节                  │
│                                                     │
│  主要公式：$$ f(x) = ax^2 + bx + c $$              │
│                                                     │
│  ┌─ 图示 ──────────────────────────────────────┐   │
│  │  TikZ / SVG / Mermaid 渲染结果               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ✓ 本步结论                                        │
│                                                     │
│  [依据来源 ▼]  → 题内依据 / 背景知识（含公式）     │
│                                                     │
│  对这一步有疑问？点此提问                           │
└─────────────────────────────────────────────────────┘
```

步骤类型覆盖：题型识别 → 题意理解 → 已知条件 → 求解目标 → 解题思路 → 推导过程 → 阶段结论 → 最终答案 → 检查验证 → 知识点总结

生成过程中，步骤区底部显示**流式预览卡片**，文字逐字出现，带跳动光标。

### 对话区

```
[新解法]  [新问题]

快速提问：
[为什么？] [换一种方法] [更详细] [更简洁] [知识点总结]

┌─────────────────────────────────────────┐
│                      用户消息  [头像] →  │
│ ← [头像]  AI 回复（Markdown + 公式）    │
└─────────────────────────────────────────┘
[引用标记：引用：步骤标题  ✕]   ← 引用某步时显示

[输入框：提问或追问… Enter发送] [→ 发送]
```

- 点击步骤卡片底部「对这一步有疑问？」→ 对话框自动带上步骤引用标记
- AI 回复支持 LaTeX 公式实时渲染

---

## 使用流程

### 基本解题流程

```
1. 在题目区输入题目文字（可粘贴 LaTeX 公式）
   或上传题目图片（支持拖拽多张）

2. 点击 [开始解题 →]
   → 系统自动识别学科和题型
   → 右侧步骤区显示学科标签（数学 / 物理 / 化学…）
   → 第一步卡片自动生成（题型识别）

3. 点击 [下一步 →] 逐步展开解题过程
   → 每步以卡片形式出现，带流式预览
   → 有公式的步骤自动渲染 LaTeX
   → 几何 / 力学 / 函数图像类题目自动生成图示

4. 所有步骤完成后，"下一步"按钮变为绿色"解题完成！"横幅
   → 步骤区顶部显示"题解摘要"（各步核心结论汇总）
```

### 追问流程

```
方式一：快速提问
  → 点击对话区的快捷按钮（为什么？/ 换一种方法 / 知识点总结…）

方式二：针对某步提问
  → 展开步骤卡片，点击底部"对这一步有疑问？点此提问"
  → 对话输入框自动带上步骤引用标记
  → 在对话框输入具体问题，Enter 发送

方式三：自由输入
  → 直接在对话框输入内容，Enter 发送
```

### 切换解法

```
点击对话区 [新解法] 按钮
  → 或在对话框输入"换一种方法 / 另一种解法"
  → AI 说明新解法与原解法的区别
  → 新解法步骤以"解法2"标签显示，与原解法并列
```

### 重置

```
题目区右上角：
  [重新解题] → 清空步骤，重新从第一步开始（保留题目）
  [新问题]   → 清空全部，输入新题目
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.12 · FastAPI · Uvicorn · SSE 流式 |
| AI 接入 | Anthropic Claude / OpenAI 兼容接口（可切换）|
| 前端 | React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion |
| 数学渲染 | KaTeX · remark-math · rehype-katex |
| 图形渲染 | TikZ（自研 SVG 渲染，支持圆/椭圆/弧/箭头）· Mermaid（懒加载）· SVG |
| 状态管理 | Zustand |
| 包管理 | conda（后端）· pnpm（前端）|

---

## 目录结构

```
education-agent/
├── environment.yml          # conda 环境（Python 3.12 + 所有后端依赖）
├── start.sh                 # 一键启动脚本（conda + pnpm）
├── backend/
│   ├── main.py              # FastAPI 路由
│   ├── agent.py             # 核心解题逻辑 + 步骤预取
│   ├── models.py            # Pydantic 数据模型
│   ├── queue_manager.py     # 并发队列控制
│   ├── log_config.py        # 日志配置
│   ├── requirements.txt     # pip 依赖列表（由 environment.yml 安装）
│   ├── .env.example         # 环境变量模板 ← 复制为 .env 后填写
│   ├── skills/              # 层级化 Skills 插件
│   │   ├── SKILL.md         # 技能注册总表
│   │   ├── skill_loader.py  # 技能加载器（自动按题型匹配子技能）
│   │   ├── core/SKILL.md    # 通用规范（格式 / LaTeX / 图示）
│   │   └── subjects/        # 学科技能 + 子技能（代数/几何/力学…）
│   └── tests/               # pytest 单元测试
└── frontend/
    ├── package.json
    ├── pnpm-lock.yaml       # pnpm 锁文件
    ├── src/
    │   ├── components/      # ProblemPanel · StepPanel · StepCard
    │   │                    # ChatPanel · MathContent · TikzDiagram · MermaidDiagram
    │   ├── hooks/useSSE.ts  # SSE 流式接收 Hook
    │   ├── store/           # Zustand 全局状态
    │   └── types/           # TypeScript 类型定义
    └── e2e/                 # Playwright E2E 测试（12 项）
```

---

## 快速开始

### 前置要求

- [conda](https://docs.conda.io/en/latest/miniconda.html)（Miniconda 或 Anaconda）
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)：`npm install -g pnpm`

### 1. 克隆仓库

```bash
git clone <repo-url>
cd education-agent
```

### 2. 创建 Python 环境

```bash
conda env create -f environment.yml
# 创建名为 education-agent 的 conda 环境，约 1-2 分钟
```

### 3. 安装前端依赖

```bash
cd frontend
pnpm install
cd ..
```

### 4. 配置 API

```bash
cp backend/.env.example backend/.env
# 用编辑器打开 backend/.env，填入 API 密钥和模型配置
```

### 5. 启动

```bash
./start.sh
```

打开浏览器访问 **http://localhost:5173**

---

## 环境变量

配置文件：`backend/.env`，模板：`backend/.env.example`

| 变量 | 说明 | 默认值 |
|---|---|---|
| `API_TYPE` | `anthropic` 或 `openai` | `anthropic` |
| `MODEL` | 模型名称 | `claude-sonnet-4-6` |
| `ANTHROPIC_API_KEY` | Anthropic API Key | — |
| `OPENAI_API_KEY` | OpenAI 兼容接口 Key | — |
| `API_BASE_URL` | OpenAI 兼容端点（`openai` 模式必填）| — |
| `OPENAI_ENABLE_THINKING` | 开启深度思考（建议关闭，减少延迟）| `false` |
| `PREFETCH_STEPS` | 预取后续步骤数，`0` 关闭 | `0` |
| `PERSIST_SESSIONS` | 会话持久化（重启后可恢复）| `true` |
| `SESSION_STORE_PATH` | 持久化路径 | `data/sessions.json` |

**OpenAI 兼容接口（如阿里云 DashScope）：**

```env
API_TYPE=openai
MODEL=qwen3.6-plus
OPENAI_API_KEY=sk-xxxxxxxx
API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PREFETCH_STEPS=1
```

**Anthropic 官方接口：**

```env
API_TYPE=anthropic
MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
PREFETCH_STEPS=1
```

---

## API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/solve` | 提交题目，创建解题会话（multipart/form-data）|
| GET | `/api/next-step/{session_id}` | 获取下一步（SSE 流式）|
| POST | `/api/chat` | 追问对话（SSE 流式）|
| GET | `/api/session/{session_id}` | 查看会话状态 |
| GET | `/api/queue` | 并发队列与运行时统计 |
| GET | `/health` | 健康检查 |

**SSE 帧格式：**

```
data: {"chunk": "..."}               # 流式文本块（逐字推送）
data: {"step": {...}, "done": true}  # 步骤完成（含完整 Step JSON）
data: {"busy": true, "error": "..."} # 服务繁忙
: ping                                # 心跳保活（每 8 秒）
```

---

## Skills 插件系统

提示词采用层级化 Skills 架构，参考 Claude Code 的 SKILL.md 设计。加载器根据检测到的学科和题型自动组合提示词：

```
core/SKILL.md           通用规范（LaTeX · 图示 · 输出格式）
    +
subjects/{subject}/SKILL.md     学科解题流程
    +
subjects/{subject}/{sub}/SKILL.md   题型专项规范（自动匹配）
```

当前内置子技能：

| 学科 | 子技能 |
|---|---|
| 数学 | algebra（代数/方程）· geometry（几何）· function（函数/导数/数列）· probability（概率统计）|
| 物理 | mechanics（力学）· electro（电磁学）|
| 化学/生物/语文/英语 | 学科级规范 |

**扩展子技能**：在学科目录下新建子目录 + `SKILL.md`，在父 `SKILL.md` 的 `sub_skills` 列表中注册，无需改代码。

---

## 测试

### 后端单元测试

```bash
conda activate education-agent
cd backend
pytest -q
# 36 项通过
```

### 前端 E2E 测试

```bash
# 终端 1：启动服务
./start.sh

# 终端 2：运行测试
cd frontend
pnpm exec playwright test
# 12 项通过
```

---

## 已知限制

- 会话持久化使用本地 JSON 文件，不适合多进程部署
- 多进程部署需将会话存储改为 Redis 或数据库
- 前端 mermaid 包体较大（gzip 后约 148KB），首次渲染流程图时按需加载
