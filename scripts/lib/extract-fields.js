import OpenAI from 'openai';

const SCALAR_FIELDS = [
  { key: 'name_en', desc: '英文项目全称' },
  { key: 'intro', desc: '一段 60-100 字的项目介绍，描述性、不要编造比较' },
  { key: 'duration', desc: '学制（如 "1 year full-time"）' },
  { key: 'tuition_hkd', desc: '总学费数字（HKD）；只填阿拉伯数字' },
  { key: 'ielts', desc: '雅思要求（如 "6.5 with no subscore below 6.0"）' },
  { key: 'toefl', desc: '托福要求（如 "80"）' },
  { key: 'cet', desc: '四六级要求；找不到就 null' },
  { key: 'gmat_gre', desc: 'GMAT/GRE 要求' },
  { key: 'background', desc: '本科背景与先修课程要求' },
  { key: 'work_experience', desc: '工作经验要求' },
  { key: 'deadline', desc: '申请截止时间（所有 round）' },
];

const LIST_FIELDS = [
  { key: 'core_courses', desc: '核心课程；若在 PDF 中未在页面列出，confidence 用 needs_manual_pdf_review' },
  { key: 'elective_courses', desc: '选修课程；同上' },
  { key: 'career_outcomes', desc: '官方公布的就业方向' },
];

function buildSchema() {
  const props = {};
  for (const f of SCALAR_FIELDS) {
    props[f.key] = {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        source_quote: { type: ['string', 'null'] },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low', 'missing', 'needs_manual_pdf_review'],
        },
      },
      required: ['value', 'source_quote', 'confidence'],
      additionalProperties: false,
    };
  }
  for (const f of LIST_FIELDS) {
    props[f.key] = {
      type: 'object',
      properties: {
        value: {
          anyOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'null' },
          ],
        },
        source_quote: { type: ['string', 'null'] },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low', 'missing', 'needs_manual_pdf_review'],
        },
      },
      required: ['value', 'source_quote', 'confidence'],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties: props,
    required: [...SCALAR_FIELDS, ...LIST_FIELDS].map(f => f.key),
    additionalProperties: false,
  };
}

const SYSTEM_PROMPT = `你是一个严谨的数据抽取助手。

任务：从输入的港校硕士项目官网纯文本中，抽出我指定的字段，每个字段返回 {value, source_quote, confidence}。

铁律：
1. value 必须能在 source_quote 中找到依据；source_quote 必须是页面里**逐字**出现过的片段
2. 找不到的字段：value = null, source_quote = null, confidence = "missing"
3. 课程列表如果页面上只链接 PDF 而没有内联列出：value = null, source_quote 写 PDF 链接, confidence = "needs_manual_pdf_review"
4. tuition_hkd 只填阿拉伯数字字符串（"420000"），不带 "HK$" 或逗号
5. 数据可能涉及多种学生类型（本地/非本地/国际生）：**仅抽 non-local / international 一档**
6. 绝不编造。绝不补全。绝不"觉得"。`;

function userPrompt(programMeta, cleanText) {
  const fieldHints = [...SCALAR_FIELDS, ...LIST_FIELDS]
    .map(f => `- ${f.key}: ${f.desc}`)
    .join('\n');
  return `项目元信息（仅供参考）：
- 学校：${programMeta.school_name}
- 中文项目名：${programMeta.name_zh}
- 已知方向：${programMeta.direction}

需要抽取的字段：
${fieldHints}

官网纯文本：
"""
${cleanText}
"""`;
}

export async function extractFields({ programMeta, cleanText, apiKey, model }) {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(programMeta, cleanText) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'program_extraction',
        strict: true,
        schema: buildSchema(),
      },
    },
  });

  const raw = completion.choices[0].message.content;
  const parsed = JSON.parse(raw);
  const usage = completion.usage;
  return { extraction: parsed, usage, model };
}

export function lowConfidenceCount(extraction) {
  return Object.values(extraction).filter(f => f.confidence === 'low').length;
}
