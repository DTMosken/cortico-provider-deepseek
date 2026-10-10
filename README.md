<!-- Owner: index.ts, pricing.ts, console/client.ts, console/server.ts, console/schedule-panel.ts, console/pricing-panel.ts, scripts/migrate-rmb-currency.mjs, package.json -->

# cortico-provider-deepseek

`cortico-provider-deepseek` 是 Cortico 的 DeepSeek 模型供应商扩展，使用 DeepSeek Responses API。

## 安装

要求 Cortico 模型供应商扩展 API 5。在 Cortico 仓库的 `extensions/` 目录安装：

```powershell
Set-Location "<Cortico 仓库路径>\extensions"
corepack pnpm add --ignore-workspace cortico-provider-deepseek
```

在 Cortico 控制台中新建 DeepSeek 端点，填写 API 密钥。默认模型为 `deepseek-flash`。

## 成本与计价

插件为 `deepseek-flash` 提供人民币模块价目。“成本与计价”面板显示峰谷单价和当前计价档位。端点自定义报价可按模型覆盖模块价目；未设置时使用模块价目。

人民币报价使用 `CNY`。已有自定义报价中的 `RMB` 在读取和保存时转换为 `CNY`，单价保持不变。Cortico 0.1.11 的用量报告可按 `usage.rates.CNY` 换算这些费用。

控制台的 `zh-Hant` 使用中文回退文案；其他未提供翻译的语言使用英文。

| 每百万 tokens | 空闲时段 | 高峰时段 |
| --- | ---: | ---: |
| 输入，缓存命中 | ¥0.02 | ¥0.04 |
| 输入，缓存未命中 | ¥1 | ¥2 |
| 输出 | ¥4 | ¥8 |

默认高峰时段为北京时间周一至周五（不含例外日期）的 09:00–12:00、14:00–18:00。周末和例外日期全天为空闲时段。时间区间包含开始时刻，不包含结束时刻。

“当前计价时段”面板可调整两段高峰时间和例外日期；例外日期每行填写一个 `YYYY-MM-DD`。初始列表包含 2026 年中国法定节假日；后续年份需要按官方安排更新。保存后的时段设置用于新请求。

价格可能变化，发布的单价以 [DeepSeek 中文价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 为准。

## 迁移历史人民币费用

`scripts/migrate-rmb-currency.mjs` 处理指定的端点配置、含 `providers` 的部署配置和 `data/usage.jsonl`。它将自定义报价及历史费用快照的币种标签从 `RMB` 改为 `CNY`，保留金额、单价、用量、快照 ID 和时间。JSONL 中无法解析的行原样保留，并在输出的 `damagedLines` 中计数。

先预览需要迁移的文件：

```powershell
node scripts/migrate-rmb-currency.mjs "<部署路径>/data/usage.jsonl" "<端点路径>/config.json"
```

停止使用该费用账本的 bot 后，加 `--write` 写入：

```powershell
node scripts/migrate-rmb-currency.mjs --write "<部署路径>/data/usage.jsonl" "<端点路径>/config.json"
```

每个有改动的文件会先保存一份同目录备份，路径显示在输出的 `backup` 中。再次运行时，已转换的 `CNY` 不产生改动或新备份。迁移只处理传入的文件路径。

## 许可证与代码来源

项目采用 MIT License，详见 [LICENSE](LICENSE)。

部分代码源自 Phantivia 编写的 Cortico `src/providers/openai-responses-compat/`。新增和修改部分由 DTMosken 编写；LICENSE 保留上游版权声明。
