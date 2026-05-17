# 数据核校流水线 · 使用指南

这是给非技术用户写的。一步一步跟着做就行。

## 它是什么

一个跑在**你电脑上**的小程序，会自动：
1. 打开每个项目的官网
2. 让 OpenAI 帮你把页面信息整理成结构化数据
3. 跟 `data.json` 现有数据比较
4. 输出一份「哪些字段需要修改」的报告

**这个程序永远不会自动改 `data.json`**——它只生成报告，你看完决定哪些采纳。

---

## 第一次使用（一次性，8-10 分钟）

### 1. 装 Node.js

打开 https://nodejs.org → 下载 **LTS 版本**（左边那个绿色按钮）→ 双击安装包 → 一路点 Next/同意。跟装微信差不多。

装完打开终端验证（Mac 用「终端 / Terminal」，Windows 用「命令提示符 / PowerShell」）：

```
node -v
```

应该显示类似 `v20.x.x` 的版本号。如果显示 "command not found"，重启终端再试。

### 2. 打开项目目录

终端里输入 `cd ` 然后**把项目文件夹拖进终端**（自动填路径），按回车。

### 3. 安装依赖

```
npm install
```

等 1-2 分钟，看到一堆绿色文字 = 成功。

### 4. 配置 API key

```
cp .env.example .env
```

（Windows 用 `copy .env.example .env`）

用任意编辑器打开 `.env` 文件，把 `OPENAI_API_KEY=sk-proj-xxx...` 那行的 `xxx...` 换成你真实的 OpenAI key。

OpenAI key 在 https://platform.openai.com/api-keys 创建。

### 5. 跑核校

```
npm run verify
```

等约 3 分钟。完成后会有提示告诉你报告在哪。

---

## 日常使用

每次想更新数据，只用敲：

```
npm run verify
```

报告生成在 `reports/verification-<日期>.md`，用任何 Markdown 阅读器或者 VSCode 打开即可。

## 其它命令

| 命令 | 用途 |
|---|---|
| `npm run verify` | 标准跑一次（用缓存，快） |
| `npm run verify:fresh` | 不用缓存，重新抓所有官网 |
| `npm run check-urls` | 只检测官网链接是否还活着（10 秒） |
| `npm run verify -- --program hku-mfin` | 只核校 hku-mfin 这一条 |

## 报告怎么看

报告会按项目分组，每个有改动的字段会显示：

```
| Field        | data.json 现值 | 官网抽出的值 | 原文出处                       | 决策    |
|--------------|---------------|-------------|-------------------------------|--------|
| tuition_hkd  | 396000        | 420000      | "Tuition fee for 2025/26: HK$420,000" | [ ]   |
```

- 看「原文出处」一栏，判断官网值是不是真的对
- 如果对 → 手动改 `data.json` 里的对应字段
- 改完想确认 → 跑 `npm run verify -- --program hku-mfin` 单独验证那一条

## 出错怎么办

任何错误信息（红字、报错堆栈）截图发我，我帮你看。

## 成本

每跑一次完整核校：约 $0.02-0.05（人民币 1 毛 5 分钱）。1000 次也就 50 美元。
