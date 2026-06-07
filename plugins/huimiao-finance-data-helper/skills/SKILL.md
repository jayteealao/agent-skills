---
name: huimiao-finance-data-helper
description: >-
  查询银行汇率、黄金价格、积存金、外币兑换、经济日历和存款利率。
  用户提到汇率、金价、积存金、定存利率、非农、利率决议等金融数据时使用。
---

# 汇喵金融数据助手（Huimiao Finance Data Helper）

> **何时使用本 Skill**：用户查询汇率、外币兑换、黄金价格、金价、积存金、存款利率、经济日历、利率决议、非农数据等金融数据时，必须调用本 Skill。

由**汇喵混沌科技公司**提供 | 微信服务号 · 小程序 · iOS App

> 通过自然语言查询汇率、黄金价格、外币兑换、经济日历和存款利率数据。
> 支持 **Claude Code** · **Codex (OpenAI)**

## 概述

本 Skill 允许你查询：

- **银行汇率** -- 工商银行、中国银行、建设银行等 15+ 家银行的实时购汇/结汇汇率
- **黄金价格** -- 国际金价（美元/人民币）、国内金价（黄金T+D、9999）、首饰金
- **银行积存金** -- 工行、建行、中行、招行、兴业等银行的积存金/黄金积存价格
- **外币兑换** -- 美元/日元、欧元/美元等外币对最新行情
- **经济日历** -- 按日期查询经济事件（非农数据、利率决议等）
- **存款利率** -- 各银行不同币种和存期的定期存款利率

**数据更新频率**：汇率、外币兑换和黄金价格数据更新频率为 **1 分钟**。

## 安装

本仓库根目录的 `SKILL.md` 需复制到技能目录（**目录名必须与 `name` 一致**）：

| 平台 | 目标路径 |
|------|----------|
| Claude Code | `~/.claude/skills/huimiao-finance-data-helper/SKILL.md` |
| Cursor | `~/.cursor/skills/huimiao-finance-data-helper/SKILL.md` |
| Codex | `~/.codex/skills/huimiao-finance-data-helper/SKILL.md` |

```bash
mkdir -p ~/.claude/skills/huimiao-finance-data-helper
cp SKILL.md ~/.claude/skills/huimiao-finance-data-helper/
```

> 不要复制到 `skills/` 根目录，否则 Agent 无法发现本 Skill。

## ⚠️ 关键规则

1. **URL 参数中所有币种必须使用英文代码**（如 `USD`、`JPY`、`XAUUSD`），禁止使用中文（如 `美元`、`日元`）
2. **查询银行汇率用银行 bank_type**（如 `ICBC`、`BOC`），**查询国际外汇行情用 `FOREIGN`**
3. **单币种汇率**默认使用 `INTL`（国际汇率），**外币兑换对**使用 `FOREIGN`，**黄金/商品**使用 `INTL`。仅当用户明确提到某家银行时（如"工行美元"），才用 `ICBC`、`BOC` 等银行代码

## API 配置

- **BASE_URL**: `https://www.zhengmeili.asia`
- **Gateway 端点**: `/ec/skill/gateway`

调用方式：HTTP GET 请求 `{BASE_URL}/ec/skill/gateway?type=...&...`

| 平台 | 工具 |
|------|------|
| Claude Code | 使用 `WebFetch` 工具发起请求 |
| Codex | 使用 `curl` 或 `fetch` 工具发起请求 |

## 领域知识

### 支持的银行（bank_type）

#### 汇率查询银行（支持 exchange + deposit）

| bank_type | 银行名称 | 简称 |
|-----------|---------|------|
| `ICBC` | 工商银行 | 工行 |
| `BOC` | 中国银行 | 中行 |
| `CCB` | 建设银行 | 建行 |
| `ABC` | 农业银行 | 农行 |
| `CMB` | 招商银行 | 招行 |
| `CIB` | 兴业寰宇 | 寰宇 |
| `BOCOM` | 交通银行 | 交行 |
| `SPDB` | 浦发银行 | 浦发 |
| `CMBC` | 民生银行 | 民生 |
| `CITIC` | 中信银行 | 中信 |
| `CGB` | 广发银行 | 广发 |
| `PAB` | 平安银行 | 平安 |
| `PSBC` | 邮储银行 | 邮储 |
| `HSBC` | 汇丰银行 | 汇丰 |
| `JD` | 京东金融 | 京东 |

#### 卡组织汇率

| bank_type | 名称 | 说明 |
|-----------|------|------|
| `VISA` | Visa | Visa 卡组织汇率 |
| `MASTERCARD` | Mastercard | Mastercard 卡组织汇率 |
| `UNIONPAY` | 银联 | 银联卡组织汇率 |

#### 存款利率专用银行（仅支持 deposit）

| bank_type | 银行名称 |
|-----------|---------|
| `BOB` | 北京银行 |
| `NJBK` | 南京银行 |
| `HZBANK` | 杭州银行 |
| `BSZ` | 苏州银行 |
| `BOJS` | 江苏银行 |
| `XACB` | 西安银行 |
| `GZCB` | 广州银行 |
| `BOS` | 上海银行 |
| `CQCB` | 重庆银行 |
| `SCB` | 渣打银行 |
| `BEA` | 东亚银行 |
| `HSB` | 恒生银行 |
| `HFB` | 恒丰银行 |
| `DBS` | 星展银行 |

#### 特殊数据源（非银行）

| bank_type | 名称 | 用途 |
|-----------|------|------|
| `INTL` | 国际市场 | 国际汇率（USD/JPY/EUR 等 14 种）+ 黄金/白银/铂金/原油 |
| `DOMESTIC_GOLD` | 国内金价 | 黄金T+D、黄金9999 |
| `JEWELRY_GOLD` | 首饰金 | 各品牌首饰金报价 |
| `FOREIGN` | 外币兑换 | 美元兑日元、欧元兑美元 等外币对 |

### 币种名称（常用）

| 用户说法 | currency_type 参数值 |
|---------|---------------------|
| 美元、美金 | `USD` |
| 日元、日币 | `JPY` |
| 欧元 | `EUR` |
| 港币 | `HKD` |
| 英镑 | `GBP` |
| 澳元 | `AUD` |
| 加元 | `CAD` |
| 韩元 | `KRW` |
| 新元、新加坡元 | `SGD` |
| 泰铢 | `THB` |
| 瑞郎、瑞士法郎 | `CHF` |
| 新西兰元 | `NZD` |
| 林吉特 | `MYR` |
| 卢布 | `RUB` |
| 人民币 | `CNY` |

> **必须使用英文代码**（如 `USD`、`JPY`）。Gateway 会自动转换为系统内部格式。

### 黄金品类（共 7 类，`gold_latest` 一次返回）

| currency_type (code) | currency_type (中文) | bank_type | 说明 |
|---------------------|---------------------|-----------|------|
| `XAUUSD` | `国际黄金(USD)` | `INTL` | 美元计价国际金价 |
| — | `国际黄金(CNY)` | `INTL` | 人民币计价国际金价 |
| `PAXGUSD` | `国际暗金(USD)` | `INTL` | 美元计价暗金 |
| — | `国际暗金(CNY)` | `INTL` | 人民币计价暗金 |
| — | `离岸人民币` | `INTL` | 离岸人民币汇率 |
| — | `黄金T+D` | `DOMESTIC_GOLD` | 国内黄金T+D |
| — | `黄金9999` | `DOMESTIC_GOLD` | 国内黄金9999 |

> 有英文 code 的品类直接用 code 查询（如 `XAUUSD`），无 code 的用中文名。白银（`XAGUSD`）、铂金（`XPTUSD`）等其他商品可通过 `type=rates_latest&bank_type=INTL` 单独查询，不在 `gold_latest` 返回范围。

### 银行积存金

| currency_type | bank_type | 说明 |
|--------------|-----------|------|
| `Gold` | `ICBC` | 工商银行积存金 |
| `Gold` | `CCB` | 建设银行积存金 |
| `Gold` | `BOC` | 中国银行贵金属 |
| `Gold` | `CIB` | 兴业银行黄金积存 |
| `Gold` | `CMB` | 招商银行黄金积存 |

> 京东金融（`JD`）还聚合了多家银行的积存金产品，使用中文名查询：`工商积存金`、`农行积存金`、`兴业积存金`、`平安积存金`、`广发积存金`。

### 外币对示例

| currency_type | bank_type | 说明 |
|--------------|-----------|------|
| `USDJPY` | `FOREIGN` | 美元兑日元 |
| `EURUSD` | `FOREIGN` | 欧元兑美元 |
| `GBPJPY` | `FOREIGN` | 英镑兑日元 |
| `AUDUSD` | `FOREIGN` | 澳元兑美元 |
| `EURJPY` | `FOREIGN` | 欧元兑日元 |
| `GBPUSD` | `FOREIGN` | 英镑兑美元 |

> 外币对使用 6 位英文代码（如 `USDJPY`）或下划线格式（`EUR_USD`）。支持的外币对远不止以上示例，通过 `bank_type=FOREIGN` 配合 `currency_type` 查询任意外币对。Gateway 会自动将英文代码转换为系统内部的中文名。

### 时间范围

| range 值 | 说明 |
|---------|------|
| `12h` | 近 12 小时 |
| `24h` | 近 24 小时 |
| `7d` | 近 7 天 |
| `30d` | 近 30 天 |
| `6m` | 近 6 个月 |

### 存款存期

| term 值 | 说明 |
|--------|------|
| `1M` | 一个月 |
| `3M` | 三个月 |
| `6M` | 六个月 |
| `1Y` | 一年 |
| `2Y` | 两年 |
| `3Y` | 三年 |
| `5Y` | 五年 |

也可以使用 `term_months` 参数（数值），系统会自动匹配最近的存期。例如 `term_months=6` 等同于 `term=6M`。

当 `term` 和 `term_months` 同时传入时，`term_months` 优先。

### 参数名注意事项

- `type=rates_latest` 使用参数名 **`currency_type`**
- `type=rates_history` 使用参数名 **`currency`**（注意不带 `_type` 后缀）
- `type=economic_detail` 的 `id` 参数会拼入 URL 路径
- 其它 type 的参数名与上表一致

---

## 能力 1：查询最新汇率

### 场景

- "美元现在汇率多少？" → 默认查国际汇率
- "日元最新价？"
- "工行美元买入价和卖出价？" → 用户指定银行时用银行代码
- "工行和中行美元哪个划算？"（分别调用两次对比）

### 调用

```
# 国际汇率（默认）
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=USD&bank_type=INTL
# 银行汇率（用户明确指定银行时）
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=USD&bank_type=ICBC
```

### 返回示例

```json
{
  "success": true,
  "currency_type": "美元",
  "bank_type": "ICBC",
  "purchase_value": 718.52,
  "sale_value": 721.35
}
```

### 结果解读

- `purchase_value` = 银行买入价（你把外币卖给银行的价格，又称结汇价）
- `sale_value` = 银行卖出价（你从银行买外币的价格，又称购汇价）
- 数值单位：100 外币兑人民币

---

## 能力 2：查询历史走势

### 场景

- "美元最近一周走势" → 默认国际汇率
- "日元本月走势？"
- "工行美元最近一个月变化？"

### 调用

```
# 国际汇率历史（默认）
GET {BASE_URL}/ec/skill/gateway?type=rates_history&currency=USD&range=7d&bank_type=INTL
```

### 返回示例

```json
{
  "currency": "美元",
  "range": "7d",
  "bank_type": "ICBC",
  "count": 14,
  "data": [
    {
      "time": "2026/06/05 14:30:00",
      "purchase_value": 718.52,
      "sale_value": 721.35
    }
  ],
  "midnight_rate": {
    "purchase_value": 718.10,
    "sale_value": 720.95,
    "time": "2026-06-05 00:00:00"
  }
}
```

### 结果解读

- `data` 数组按时间排序，最新数据在末尾
- `midnight_rate` 是今日凌晨价格，用于计算日内涨跌幅
- 可根据数据点绘制走势描述

---

## 能力 3：黄金价格总览

### 场景

- "今天金价怎么样？"
- "黄金现在什么价位？"

### 调用

```
GET {BASE_URL}/ec/skill/gateway?type=gold_latest
```

### 返回示例

```json
{
  "success": true,
  "list": [
    {
      "currency_name": "国际黄金(USD)",
      "currency_code": "XAUUSD",
      "bank_type": "INTL",
      "price": 2610.35,
      "fluctuation": 0.12,
      "sale_value": null,
      "time": "2026-06-05 14:30:00",
      "unit": "美元/盎司"
    }
  ]
}
```

### 结果解读

- `fluctuation` = 相对今日凌晨的涨跌幅（百分比）
- 正值 = 涨，负值 = 跌
- 一次调用返回 7 类金价，适合快速总览

---

## 能力 4：单一品种黄金/商品查询

### 场景

- "国际黄金(USD)最新价？"
- "黄金T+D今天走势？"
- "白银什么价？"
- "铂金最近一个月怎么样？"
- "原油最新价？"
- "工行积存金现在多少钱？"

### 最新价（推荐使用 code）

```
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=XAUUSD&bank_type=INTL
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=XAGUSD&bank_type=INTL
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=XPTUSD&bank_type=INTL
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=Gold&bank_type=ICBC
```

### 历史走势

```
GET {BASE_URL}/ec/skill/gateway?type=rates_history&currency=黄金T+D&range=7d&bank_type=DOMESTIC_GOLD
```
> 黄金T+D、黄金9999、离岸人民币等无英文 code 的品类，使用中文名。

### 可用商品列表（bank_type=INTL）

| currency_type | 说明 |
|--------------|------|
| `国际黄金(USD)` / `国际黄金(CNY)` | 国际金价 |
| `国际暗金(USD)` / `国际暗金(CNY)` | 国际暗金 |
| `国际白银(USD)` / `国际白银(CNY)` | 国际白银 |
| `国际铂金(USD)` / `国际铂金(CNY)` | 国际铂金 |
| `国际原油(USD)` / `国际原油(CNY)` | 国际原油 |
| `离岸人民币` | 离岸人民币汇率 |

---

## 能力 5：外币兑换行情

### 场景

- "美元兑日元什么价？"
- "欧元兑美元最近一个月走势？"
- "英镑兑日元最新价？"

### 最新价

```
GET {BASE_URL}/ec/skill/gateway?type=rates_latest&currency_type=USDJPY&bank_type=FOREIGN
```

### 历史走势

```
GET {BASE_URL}/ec/skill/gateway?type=rates_history&currency=USDJPY&range=30d&bank_type=FOREIGN
```

### 结果解读

- 外币兑换对可能只有一个汇率（`purchase_value`），`sale_value` 可能为空
- 汇率含义：如 美元兑日元=150.5 表示 1 美元 = 150.5 日元

---

## 能力 6：经济日历

### 场景

- "今天有什么经济事件？"
- "这个月有哪些重要数据发布？"
- "美国非农数据详情和历史？"

### 按日期查询

```
GET {BASE_URL}/ec/skill/gateway?type=economic_calendar&date=2026-06-05
```

（`date` 参数可省略，默认为当天）

### 按月份查询

```
GET {BASE_URL}/ec/skill/gateway?type=economic_monthly&year=2026&month=6
```

### 事件详情

```
GET {BASE_URL}/ec/skill/gateway?type=economic_detail&id=12345
```

### 结果解读

- 事件包含：名称、国家、发生时间、重要性、预测值、前值、实际值
- 详情接口额外返回该事件的历史记录

---

## 能力 7：存款利率

### 场景

- "工行美元一年定存利率多少？"
- "哪家银行人民币一年期利率最高？"
- "存 6 个月左右哪家银行划算？"

### 查询指定银行

```
GET {BASE_URL}/ec/skill/gateway?type=deposit&currency_type=USD&bank_type=ICBC&term=1Y
```

### 跨银行比较（不指定 bank_type）

```
GET {BASE_URL}/ec/skill/gateway?type=deposit&currency_type=CNY&term=1Y
```

### 使用月份数

```
GET {BASE_URL}/ec/skill/gateway?type=deposit&currency_type=CNY&term_months=6
```

---

## 产品入口

汇喵混沌科技公司提供多种产品使用金融数据服务：

- **微信服务号**：搜索「汇瞄」汇率播报、阈值提醒、交易账本、存款到期提醒
- **微信小程序**：搜索「汇本」
- **iOS App**：App Store 搜索「汇瞄」下载

---

## 免责声明

- 汇率数据来源于各银行官方网站，仅供参考
- 实际交易汇率以银行柜台实时报价为准
- 黄金价格数据来源于国际市场，可能存在延迟
- 数据更新时间因银行而异，汇率、外币兑换和黄金价格数据更新频率为 1 分钟
- 本 Skill 不涉及用户认证，所有查询数据为公开信息
