import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,          // 单个测试超时（模型响应可能慢）
  expect: { timeout: 15_000 },
  fullyParallel: false,     // 避免多个用例同时打 LLM 接口
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // 运行测试前确保前后端已启动（由外部 start.sh 负责）
  // webServer 配置留空，测试时手动启动服务
})
