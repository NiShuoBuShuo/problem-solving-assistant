import { Page, expect } from '@playwright/test'

/** 等待下一步按钮可用（不在 loading 状态）*/
export async function waitForNextStepReady(page: Page) {
  await expect(
    page.getByRole('button', { name: /下一步/ })
  ).toBeEnabled({ timeout: 30_000 })
}

/** 点击"下一步"并等待：
 *   - 新步骤卡片出现（正常情况），OR
 *   - complete-banner 出现（最后一步 is_final=true 时按钮消失）
 *  返回点击后实际步骤数。超时 90s 应对慢速 LLM。
 */
export async function clickNextStep(page: Page): Promise<number> {
  const before = await page.locator('[data-testid="step-card"]').count()

  // 若已完成直接返回
  if (await page.locator('[data-testid="complete-banner"]').isVisible()) return before

  await page.getByRole('button', { name: /下一步/ }).click()

  // 等待：步骤数增加 OR 完成横幅出现（两者之一即可）
  await expect(async () => {
    const count   = await page.locator('[data-testid="step-card"]').count()
    const done    = await page.locator('[data-testid="complete-banner"]').isVisible()
    expect(count > before || done).toBe(true)
  }).toPass({ timeout: 90_000, intervals: [500] })

  return page.locator('[data-testid="step-card"]').count()
}

/** 提交一道题，等待会话建立（API 调用慢时留足余量） */
export async function submitProblem(page: Page, text: string) {
  await page.goto('/')
  await page.locator('textarea[placeholder*="输入题目"]').fill(text)
  await page.getByRole('button', { name: /开始解题/ }).click()
  // 先等待会话建立，再等待首步自动生成完成
  await expect(page.locator('[data-testid="subject-badge"]')).toBeVisible({ timeout: 40_000 })
  await expect(page.locator('[data-testid="step-card"]').first()).toBeVisible({ timeout: 90_000 })
}

/** 读取步骤卡片的 title 列表 */
export async function getStepTitles(page: Page): Promise<string[]> {
  const cards = page.locator('[data-testid="step-card"]')
  const count = await cards.count()
  const titles: string[] = []
  for (let i = 0; i < count; i++) {
    titles.push(await cards.nth(i).locator('[data-testid="step-title"]').innerText())
  }
  return titles
}
