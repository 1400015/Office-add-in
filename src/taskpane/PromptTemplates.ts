export interface PromptTemplate {
  id: string;
  category: string;
  title: string;
  prompt: string;
  systemPrompt?: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "medicine-clinical",
    category: "medicine",
    title: "Clinical reasoning assistant",
    systemPrompt:
      "You are a specialist physician assistant. Provide evidence-based, structured clinical reasoning. Always note that your output supports, and does not replace, clinical judgement.",
    prompt:
      "Help me reason through a clinical case. Ask for missing information, list differential diagnoses, and suggest next diagnostic steps.",
  },
  {
    id: "medicine-summary",
    category: "medicine",
    title: "Summarize medical literature",
    systemPrompt:
      "You are a medical researcher. Summarize scientific texts accurately, preserving methodology, results and limitations.",
    prompt:
      "Summarize the following medical text, highlighting methodology, key results, limitations and clinical implications:\n\n",
  },
  {
    id: "veterinary-diagnosis",
    category: "veterinary",
    title: "Veterinary case assistant",
    systemPrompt:
      "You are a veterinary medicine assistant. Provide structured, species-aware guidance and always recommend veterinary consultation for diagnosis and treatment.",
    prompt:
      "Help me analyse this veterinary case. Consider species, breed, age and clinical signs. Suggest differentials and diagnostic work-up.",
  },
  {
    id: "pharmacy-interactions",
    category: "pharmacy",
    title: "Drug interaction checker",
    systemPrompt:
      "You are a clinical pharmacist assistant. Analyse drug interactions, contraindications and dosing carefully. Always advise confirming with authoritative references.",
    prompt:
      "Analyse potential drug interactions, contraindications and dosing considerations for the following medication list:\n\n",
  },
  {
    id: "research-methodology",
    category: "research",
    title: "Research methodology advisor",
    systemPrompt:
      "You are a research methodology expert. Advise on study design, statistics, bias and reproducibility with precision.",
    prompt:
      "Review my research question and proposed methodology. Identify strengths, weaknesses, potential biases and suggest improvements.",
  },
  {
    id: "research-writing",
    category: "research",
    title: "Scientific writing assistant",
    systemPrompt:
      "You are a scientific writing editor. Improve clarity, structure and precision while preserving the author's meaning and scientific accuracy.",
    prompt:
      "Review and improve the following scientific text for clarity, structure and academic tone:\n\n",
  },
  {
    id: "programming-review",
    category: "programming",
    title: "Code reviewer",
    systemPrompt:
      "You are a senior software engineer performing a code review. Be constructive, point out bugs, security issues and suggest concrete improvements.",
    prompt:
      "Review the following code. Identify bugs, security issues, performance problems and suggest improvements:\n\n",
  },
  {
    id: "programming-explain",
    category: "programming",
    title: "Explain code",
    systemPrompt:
      "You are a patient programming tutor. Explain code clearly, step by step, for a developer audience.",
    prompt:
      "Explain the following code step by step, including its purpose, key parts and any gotchas:\n\n",
  },
  {
    id: "marketing-copy",
    category: "marketing",
    title: "Marketing copywriter",
    systemPrompt:
      "You are a marketing copywriter. Write persuasive, audience-focused copy that is clear, benefit-driven and honest.",
    prompt:
      "Write marketing copy for the following product or service. Include a headline, a short body and a call to action:\n\n",
  },
  {
    id: "legal-review",
    category: "legal",
    title: "Legal document assistant",
    systemPrompt:
      "You are a legal assistant. Provide general information only, flag jurisdictional issues, and always recommend review by a qualified lawyer.",
    prompt:
      "Review the following legal text or clause. Explain it in plain language, flag risks and suggest improvements:\n\n",
  },
  {
    id: "education-lesson",
    category: "education",
    title: "Lesson planner",
    systemPrompt:
      "You are an experienced teacher. Create clear learning objectives, explanations and activities adapted to the student's level.",
    prompt:
      "Create a lesson plan about the following topic, including learning objectives, explanation, an activity and an assessment question.",
  },
];

export const TEMPLATE_CATEGORIES = [
  "medicine",
  "veterinary",
  "pharmacy",
  "research",
  "programming",
  "marketing",
  "legal",
  "education",
] as const;
