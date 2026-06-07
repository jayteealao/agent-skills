# 汇瞄金融数据助手（Huimiao Finance Data Helper）

> 支持 **Claude Code** · **Codex (OpenAI)**

[中文](#中文) | [English](#english)

---

## 中文

由**汇喵混沌科技公司**提供的 AI Coding Agent Skill，通过自然语言查询金融数据。支持 Claude Code 和 Codex (OpenAI) 双平台。

### 功能

- 查询 15+ 家银行实时汇率
- 查看国际/国内黄金价格（7 类金价）
- 查询银行积存金价格（工行、建行、中行、招行、兴业等）
- 查询外币兑换行情
- 浏览经济日历
- 比较各家银行存款利率

### 安装

Skill 必须放在**以技能名命名的子目录**中，不能直接复制到 `skills/` 根目录。

**Claude Code:**
```bash
mkdir -p ~/.claude/skills/huimiao-finance-data-helper
cp SKILL.md ~/.claude/skills/huimiao-finance-data-helper/
```

**Cursor:**
```bash
mkdir -p ~/.cursor/skills/huimiao-finance-data-helper
cp SKILL.md ~/.cursor/skills/huimiao-finance-data-helper/
```

**Codex (OpenAI):**
```bash
mkdir -p ~/.codex/skills/huimiao-finance-data-helper
cp SKILL.md ~/.codex/skills/huimiao-finance-data-helper/
```

### 使用示例

- "工行美元现在汇率多少？"
- "今天金价怎么样？"
- "美元兑日元什么价？"
- "今天有什么经济事件？"
- "哪家银行人民币一年期定存利率最高？"

### 数据来源

由汇喵混沌科技公司提供数据支持，通过银行官网和国际市场实时采集。

**数据更新频率**：汇率、外币兑换和黄金价格数据每 **1 分钟**更新一次。

### 产品矩阵

汇喵混沌科技公司旗下产品：

| 产品 | 说明 |
|------|------|
| **微信服务号** | 搜索「汇瞄」，支持汇率查询、阈值提醒、波动提醒等 |
| **微信小程序** | 搜索「汇本」 |
| **iOS App** | App Store 搜索「汇瞄」下载 |

### 免责声明

- 汇率数据来源于各银行官方网站，仅供参考
- 实际交易汇率以银行柜台实时报价为准
- 黄金价格数据来源于国际市场，可能存在延迟
- 数据更新时间因银行而异

---

## English

An AI Coding Agent Skill by **Huimiao Chaos Technology**, query financial data via natural language. Works with **Claude Code** and **Codex (OpenAI)**.

### Features

- Real-time exchange rates from 15+ Chinese banks
- International & domestic gold prices (7 categories)
- Bank gold savings prices (ICBC, CCB, BOC, CMB, CIB & more)
- Foreign currency pair rates
- Economic calendar events
- Deposit interest rate comparison

### Installation

The skill must live in a **directory named after the skill**, not directly under `skills/`.

**Claude Code:**
```bash
mkdir -p ~/.claude/skills/huimiao-finance-data-helper
cp SKILL.md ~/.claude/skills/huimiao-finance-data-helper/
```

**Cursor:**
```bash
mkdir -p ~/.cursor/skills/huimiao-finance-data-helper
cp SKILL.md ~/.cursor/skills/huimiao-finance-data-helper/
```

**Codex (OpenAI):**
```bash
mkdir -p ~/.codex/skills/huimiao-finance-data-helper
cp SKILL.md ~/.codex/skills/huimiao-finance-data-helper/
```

### Examples

- "What's the USD exchange rate at ICBC?"
- "How's gold price today?"
- "What's USD/JPY rate?"
- "Any economic events today?"
- "Which bank has the best 1-year CNY deposit rate?"

### Data Source

Powered by Huimiao Chaos Technology. Data collected from bank websites and international markets in real-time.

**Update frequency**: Exchange rates, foreign pairs, and gold prices refresh every **1 minute**.

### Products

Huimiao Chaos Technology products:

| Product | Description |
|---------|-------------|
| **WeChat Official Account** | Search "汇瞄" — rate broadcasts, threshold alerts, transaction ledger |
| **WeChat Mini Program** | Search "汇本" |
| **iOS App** | Search "汇瞄" on App Store |

### Disclaimer

- Exchange rates are sourced from bank websites for reference only
- Actual transaction rates are subject to bank counter quotes
- Gold prices may have slight delays from international markets
- Data update intervals vary by bank
