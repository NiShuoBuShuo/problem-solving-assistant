---
name: mechanics
description: 力学子技能 — 运动学、动力学、能量、动量解题规范
version: "2.0"
type: sub-skill
subject: physics
parent: physics
problem_types:
  - 力学
  - 运动学
  - 动力学
  - 牛顿
  - 能量
  - 动量
  - 圆周运动
  - 简谐运动
  - 碰撞
keywords:
  - 速度
  - 加速度
  - 摩擦力
  - 弹力
  - 功
  - 能量守恒
  - 动量守恒
  - 匀速
  - 匀加速
  - 抛体
  - 向心力
diagram_policy: required
---

## 力学解题规范（子技能）

**运动学四大公式**（使用时明确适用条件：匀变速直线运动）：
$$v = v_0 + at, \quad x = v_0 t + \frac{1}{2}at^2, \quad v^2 = v_0^2 + 2ax, \quad x = \frac{v_0+v}{2}t$$

**受力分析必须画图**（`diagram_tikz` 优先）：
- 每道力学题的第一步：画受力分析图
- 标出每个力的名称、方向、大小（若已知）
- 正方向：明确定义，沿受力方向或运动方向为正

**TikZ 受力图模板**（推荐布局）：
```
\draw[thick] (-2,0) -- (4,0);           % 地面
\draw[thick, fill=gray!15] (0,0) rectangle (1.6,1.1);  % 物块
% 物块中心约 (0.8, 0.55)
\draw[->, thick, blue] (0.8,1.1) -- (0.8,2.2) node[above] {$N$};   % 支持力
\draw[->, thick, red]  (0.8,0.55) -- (0.8,-0.8) node[below] {$mg$}; % 重力
\draw[->, thick, green!70!black] (0.8,0.55) -- (2.4,0.55) node[right] {$F$}; % 外力
```

**能量方法**：
- 先判断是否满足能量守恒（无耗散力）或动能定理（合外力做功）
- 写出初态/末态的能量表达式，中间过程的功

**动量方法**：
- 判断是否为完全弹性碰撞/完全非弹性碰撞
- 系统动量守恒：说明系统所受合外力为零（或在某方向上为零）

**圆周运动**：
- 明确向心力来源（哪些力提供向心力）
- $F_{\text{向}} = m\dfrac{v^2}{r} = m\omega^2 r$
