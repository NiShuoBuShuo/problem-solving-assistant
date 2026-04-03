/**
 * E2E: 对话交互流程
 *
 *   AC-6  追问不重置步骤（步骤数只增不减）
 *   AC-C1 对话区支持输入并显示 AI 回复
 *   AC-C2 快捷提问按钮可用
 *   AC-C3 服务繁忙时显示 Toast
 *   AC-C4 引用步骤后聊天框显示引用标记
 */

import { test, expect } from '@playwright/test'
import { submitProblem } from './helpers'

const PROBLEM = '一辆汽车以60km/h匀速行驶，2小时能行驶多少公里？'

test.describe('对话交互', () => {

  test('AC-C1 可以在对话区输入并收到 AI 回复', async ({ page }) => {
    test.setTimeout(180_000)
    await submitProblem(page, PROBLEM)

    const input = page.locator('textarea[placeholder*="提问"]')
    await input.fill('请解释这一步')
    await page.keyboard.press('Enter')

    // 等待 AI 回复气泡出现
    const aiBubble = page.locator('[data-testid="chat-message-assistant"]')
    await expect(aiBubble.last()).toBeVisible({ timeout: 30_000 })
    const content = await aiBubble.last().innerText()
    expect(content.length).toBeGreaterThan(0)
  })

  test('AC-6 追问后步骤数量不减少', async ({ page }) => {
    test.setTimeout(180_000)
    await submitProblem(page, PROBLEM)

    const countBefore = await page.locator('[data-testid="step-card"]').count()

    // 发送追问
    const input = page.locator('textarea[placeholder*="提问"]')
    await input.fill('为什么这样计算？')
    await page.keyboard.press('Enter')

    // 等待回复
    await expect(page.locator('[data-testid="chat-message-assistant"]').last()).toBeVisible({ timeout: 60_000 })

    const countAfter = await page.locator('[data-testid="step-card"]').count()
    expect(countAfter).toBeGreaterThanOrEqual(countBefore)
  })

  test('AC-C2 快捷提问按钮触发对话', async ({ page }) => {
    await submitProblem(page, PROBLEM)

    // 点击"为什么？"快捷按钮
    const quickBtn = page.getByRole('button', { name: '为什么？' })
    await expect(quickBtn).toBeVisible()
    await quickBtn.click()

    // 用户消息气泡出现
    await expect(page.locator('[data-testid="chat-message-user"]').last()).toBeVisible({ timeout: 5_000 })
  })

  test('AC-C4 点击"对这一步有疑问"后聊天区显示引用标记', async ({ page }) => {
    await submitProblem(page, PROBLEM)

    // 展开第一张卡片并点击引用链接
    const card = page.locator('[data-testid="step-card"]').first()
    const askBtn = card.getByText(/对这一步有疑问/)
    await expect(askBtn).toBeVisible()
    await askBtn.click()

    // 聊天区应出现引用标记
    await expect(page.locator('[data-testid="chat-reference-badge"]')).toBeVisible({ timeout: 3_000 })
  })

  test('AC-C3 繁忙提示 Toast 在服务返回 busy 后显示', async ({ page }) => {
    await submitProblem(page, PROBLEM)

    // 拦截 /api/next-step 返回 busy SSE 帧
    await page.route('**/api/next-step/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"busy":true,"error":"服务繁忙，请稍后再试"}\n\n',
      })
    })

    await page.getByRole('button', { name: /下一步/ }).click()
    await expect(page.locator('[data-testid="busy-toast"]')).toBeVisible({ timeout: 5_000 })
  })
})
