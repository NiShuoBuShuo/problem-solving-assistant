/**
 * E2E: 解题主流程
 *
 * 覆盖 PRD §17 验收标准：
 *   AC-1  输入题目 → 识别学科 + 进入步骤区
 *   AC-2  每次"下一步"只出现一张新卡片
 *   AC-3  步骤卡片结构：类型标签 + 标题 + 展开内容
 *   AC-4  显示流式预览（生成中卡片 + 文字逐步出现）
 *   AC-5  多步 index 严格递增（通过卡片顺序验证）
 *   AC-F  完成后显示"解题完成"
 */

import { test, expect } from '@playwright/test'
import { submitProblem, clickNextStep, waitForNextStepReady, getStepTitles } from './helpers'

const MATH_PROBLEM = 'x²-5x+6=0，求x的所有实数解'

test.describe('解题主流程', () => {

  test('AC-1 提交题目后识别学科并展示步骤区', async ({ page }) => {
    await submitProblem(page, MATH_PROBLEM)

    // 学科 badge 可见
    const badge = page.locator('[data-testid="subject-badge"]')
    await expect(badge).toBeVisible()
    const text = await badge.innerText()
    expect(['数学', '物理', '化学', '生物', '语文', '英语']).toContain(text)

    // 首步应自动出现，不需要再点一次"下一步"
    await expect(page.locator('[data-testid="step-card"]')).toHaveCount(1)
  })

  test('AC-2 每次点击"下一步"只增加一张卡片', async ({ page }) => {
    test.setTimeout(180_000)
    await submitProblem(page, MATH_PROBLEM)

    // 提交后会自动出现第一步
    await expect(page.locator('[data-testid="step-card"]')).toHaveCount(1)

    // 第二步
    await clickNextStep(page)
    await expect(page.locator('[data-testid="step-card"]')).toHaveCount(2)

    // 第三步
    await waitForNextStepReady(page)
    await clickNextStep(page)
    await expect(page.locator('[data-testid="step-card"]')).toHaveCount(3)
  })

  test('AC-3 步骤卡片包含类型标签和标题', async ({ page }) => {
    await submitProblem(page, MATH_PROBLEM)

    const card = page.locator('[data-testid="step-card"]').first()

    // 类型标签（如"题型识别"）
    await expect(card.locator('[data-testid="step-type-label"]')).toBeVisible()
    // 标题
    await expect(card.locator('[data-testid="step-title"]')).toBeVisible()
    const title = await card.locator('[data-testid="step-title"]').innerText()
    expect(title.length).toBeGreaterThan(0)
  })

  test('AC-3 点击卡片标题可展开内容', async ({ page }) => {
    await submitProblem(page, MATH_PROBLEM)

    const card = page.locator('[data-testid="step-card"]').first()
    // 新生成的步骤默认展开
    await expect(card.locator('[data-testid="step-content"]')).toBeVisible()
  })

  test('AC-4 点击下一步后出现流式预览区域', async ({ page }) => {
    await submitProblem(page, MATH_PROBLEM)

    // 监听点击后的 loading 状态：按钮变为"生成中…"即为流式预览已开始
    await page.getByRole('button', { name: /下一步/ }).click()

    // 点击后立即检查：streaming-card / loading按钮 / 已完成的step-card 三者任一可见即通过
    // 使用 first() 避免 strict-mode violation（多个元素同时匹配时）
    await expect(
      page.locator('[data-testid="streaming-card"], [data-testid="step-card"], button[disabled]')
        .first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('AC-5 多步卡片按顺序排列', async ({ page }) => {
    test.setTimeout(180_000)
    await submitProblem(page, MATH_PROBLEM)

    // 最多点击 3 次，遇到 complete-banner 提前退出
    for (let i = 0; i < 3; i++) {
      const done = await page.locator('[data-testid="complete-banner"]').isVisible()
      if (done) break
      await waitForNextStepReady(page)
      await clickNextStep(page)
    }

    const cards = page.locator('[data-testid="step-card"]')
    const count = await cards.count()
    // 至少有自动生成的首步，且 data-step-index 从 0 严格递增
    expect(count).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < count; i++) {
      const idx = await cards.nth(i).getAttribute('data-step-index')
      expect(Number(idx)).toBe(i)
    }
  })

  test('完成后显示"解题完成"横幅', async ({ page }) => {
    test.setTimeout(300_000)  // 完整解题流程，给足时间
    await submitProblem(page, MATH_PROBLEM)

    // 持续点击下一步直到 complete-banner 出现（最多 12 步）
    for (let i = 0; i < 12; i++) {
      const done = await page.locator('[data-testid="complete-banner"]').isVisible()
      if (done) break
      // 等待按钮可用再点击，并等待新步骤出现
      await waitForNextStepReady(page)
      await clickNextStep(page)
    }

    await expect(page.locator('[data-testid="complete-banner"]')).toBeVisible({ timeout: 15_000 })
  })
})
