'use strict';

const { Groq } = require('groq-sdk');
const { load, RELATIONS, STYLES } = require('./config');

const apiKey = process.env.GROQ_API_KEY || '';
const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

let client = null;
function getClient() {
  if (!apiKey || apiKey === 'gsk_your_key_here') {
    throw new Error('GROQ_API_KEY not set. Add it to .env (see .env.example).');
  }
  if (!client) client = new Groq({ apiKey });
  return client;
}

const STYLE_GUIDE = {
  warm:      'warm, heartfelt, emotional — focus on love, gratitude, and shared memories. 3-4 sentences.',
  funny:     'funny and playful with light teasing about getting older, but never mean. Include one joke. 3-4 sentences.',
  formal:    'formal, polite, and respectful. Suitable for professional relationships. 2-3 sentences.',
  short:     'short and sweet, just 1-2 punchy lines perfect for a quick WhatsApp message.',
  poetic:    'poetic with rhyming verses or shayari style. 4 lines that rhyme.',
  religious: 'religious tone with blessings and prayers. Generic, suitable for any faith. 2-3 sentences.'
};

const RELATION_LABEL = (id) => {
  const r = RELATIONS.find(x => x.id === id);
  return r ? r.label : id;
};

const STYLE_LABEL = (id) => {
  const s = STYLES.find(x => x.id === id);
  return s ? s.label : id;
};

function buildPrompt(cfg) {
  const name = cfg.birthdayPersonName?.trim() || 'the birthday person';
  const rel = RELATION_LABEL(cfg.relation);
  const style = STYLE_LABEL(cfg.style);
  const guide = STYLE_GUIDE[cfg.style] || STYLE_GUIDE.warm;
  const ageLine = cfg.age ? `They are turning ${cfg.age} years old.` : '';

  return `You are a thoughtful WhatsApp message writer.
Write a birthday wish for: ${name}
Relationship to sender: ${rel}
${ageLine}

Style: ${style} — ${guide}

Rules:
- Output ONLY the message text, no preface, no quotes, no markdown.
- Use 1-2 tasteful emojis max.
- Keep it under 60 words unless style says otherwise.
- Make it feel personal and genuine, not generic.
- Do NOT include "Here is your wish:" or any meta text.`;
}

/**
 * Generate a single birthday wish using Groq.
 * Returns { text, ms }
 */
async function generateWish() {
  const cfg = load();
  const groq = getClient();

  const prompt = buildPrompt(cfg);

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You write concise, heartfelt WhatsApp birthday wishes. You output only the wish text, nothing else.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.9,
    max_tokens: 200,
    top_p: 1
  });

  const text = (completion.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Groq returned empty content');
  return { text, ms: completion.usage?.total_tokens || 0 };
}

function isConfigured() {
  return !!(apiKey && apiKey !== 'gsk_your_key_here');
}

module.exports = { generateWish, isConfigured, RELATION_LABEL, STYLE_LABEL };
