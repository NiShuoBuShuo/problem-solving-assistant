---
name: education-agent-skills
description: 教学解题 Agent 技能插件集合注册表
version: "2.0"
type: registry
---

# Education Agent Skills Registry

本文件为**技能注册总表**，描述各子技能的位置与职责。加载器（skill_loader.py）
以本目录为根，按以下层次组合系统提示。

## 技能树结构

```
skills/
├── SKILL.md              ← 本文件：注册表（不直接注入提示词）
├── core/
│   └── SKILL.md          ← 核心基础提示（所有学科共用）
│                           定义：教学理念、输出格式、LaTeX规范、图示规范、引用规范
└── subjects/             ← 学科技能（按检测到的学科加载其一）
    ├── math/
    │   ├── SKILL.md      ← 数学学科提示
    │   ├── algebra/      ← 子技能：代数/方程/不等式
    │   ├── geometry/     ← 子技能：平面几何/立体几何/解析几何
    │   ├── function/     ← 子技能：函数/图像/导数/数列/三角
    │   └── probability/  ← 子技能：概率/统计/排列组合
    ├── physics/
    │   ├── SKILL.md      ← 物理学科提示
    │   ├── mechanics/    ← 子技能：力学/运动学
    │   └── electro/      ← 子技能：电磁学/电路
    ├── chemistry/
    │   └── SKILL.md
    ├── biology/
    │   └── SKILL.md
    ├── chinese/
    │   └── SKILL.md
    └── english/
        └── SKILL.md
```

## 加载与组合规则

加载器按以下顺序拼接提示词（各部分以空行分隔）：

1. **core/SKILL.md** — 必加载，定义全局格式与教学原则
2. **subjects/{subject}/SKILL.md** — 按学科加载，定义该学科解题流程
3. **subjects/{subject}/{sub_skill}/SKILL.md** — 可选，按题型关键词匹配，
   精细化某类题型的解题规范

## 扩展方法

新增子技能：
1. 在对应学科目录下创建子目录，如 `subjects/math/vector/`
2. 在其中创建 `SKILL.md`，写入 frontmatter（含 `problem_types` 和 `keywords`）
3. 在父 `SKILL.md` 的 `sub_skills` 列表中注册该目录名

新增学科：
1. 在 `subjects/` 下创建学科目录和 `SKILL.md`
2. 在 `backend/models.py` 的 `Subject` 枚举中添加对应值
