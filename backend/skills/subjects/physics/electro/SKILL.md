---
name: electro
description: 电磁学子技能 — 电路、电场、磁场、电磁感应解题规范
version: "2.0"
type: sub-skill
subject: physics
parent: physics
problem_types:
  - 电学
  - 电路
  - 电场
  - 磁场
  - 电磁感应
  - 电容
  - 电阻
  - 安培力
  - 洛伦兹力
keywords:
  - 电流
  - 电压
  - 电阻
  - 欧姆
  - 串联
  - 并联
  - 磁通量
  - 感应电动势
  - 法拉第
  - 楞次定律
diagram_policy: required
---

## 电磁学解题规范（子技能）

**电路分析（先画电路图）**：
- 判断串联/并联/混联：逐段分析电流路径
- 等效化简步骤：先化并联，再化串联
- 标出各支路电流方向（在 `diagram_svg` 或 `diagram_tikz` 中）

**欧姆定律应用**：
- 整体法与局部法：明确说明对哪个回路/元件列方程
- 内阻：$U = \varepsilon - Ir$（说明为什么用内阻公式）

**电场**：
- 电场线方向：从正电荷到负电荷
- 等势面：垂直于电场线
- 匀强电场中：$E = \dfrac{U}{d}$，$W = qEd\cos\theta$

**磁场与安培力**：
- 安培力方向：左手定则（四指弯向电流方向，大拇指为安培力方向，磁场穿手心）
- 安培力大小：$F = BIL\sin\theta$

**电磁感应**：
- 楞次定律判断感应电流方向：感应磁场阻碍磁通量变化
- 法拉第电磁感应定律：$\varepsilon = N\dfrac{\Delta\Phi}{\Delta t}$
- 导体切割磁力线：$\varepsilon = BLv\sin\theta$

**`diagram_svg` 推荐**：
- 简单串并联电路（矩形符号标 R、电池符号）
- 安培力方向示意图
