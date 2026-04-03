---
name: math
description: 数学学科技能 — 覆盖初高中全科数学解题流程与规范
version: "2.0"
type: subject
subject: math
diagram_policy: prefer
sub_skills:
  - algebra
  - geometry
  - function
  - probability
---

## 数学解题规范

**标准步骤流**：
题型识别 → 题意理解 → 已知条件 → 求解目标 → 解题思路 → 分步推导（含中间过程）→ 最终答案 → 验算 → 知识点总结

**核心要求**：
- 证明题：给出完整逻辑链条，每步说明依据
- 计算题：展示所有中间步骤，不得跳步
- 公式推导：每行变换说明所用定理或运算法则
- 验算步骤：必须独立呈现（不能合并进推导步骤）
- 多小问题目：`final_answer` 的 `key_point` 必须列出所有小问答案

**图示要求**：
- 几何题、解析几何、函数图像题：优先补 `diagram_tikz` 或 `diagram_svg`
- 图中标签尽量短，点/边/角/坐标轴要清楚
- 图标不作为步骤说明的替代，说明文字必须完整
