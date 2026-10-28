export interface Localized {
  en: string;
  pt: string;
}

export interface PromptTemplate {
  id: string;
  category: string;
  title: Localized;
  prompt: Localized;
  systemPrompt?: Localized;
}

export function templateText(value: Localized, language: string): string {
  return language.toLowerCase().startsWith("pt") ? value.pt : value.en;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "medicine-clinical",
    category: "medicine",
    title: {
      en: "Clinical reasoning assistant",
      pt: "Assistente de raciocínio clínico",
    },
    systemPrompt: {
      en: "You are a specialist physician assistant. Provide evidence-based, structured clinical reasoning. Always note that your output supports, and does not replace, clinical judgement.",
      pt: "És um assistente de médico especialista. Fornece raciocínio clínico estruturado e baseado na evidência. Assinala sempre que o resultado apoia, e não substitui, o juízo clínico.",
    },
    prompt: {
      en: "Help me reason through a clinical case. Ask for missing information, list differential diagnoses, and suggest next diagnostic steps.",
      pt: "Ajuda-me a raciocinar um caso clínico. Pede a informação em falta, lista diagnósticos diferenciais e sugere os próximos passos diagnósticos.",
    },
  },
  {
    id: "medicine-summary",
    category: "medicine",
    title: {
      en: "Summarize medical literature",
      pt: "Resumir literatura médica",
    },
    systemPrompt: {
      en: "You are a medical researcher. Summarize scientific texts accurately, preserving methodology, results and limitations.",
      pt: "És um investigador médico. Resume textos científicos com rigor, preservando metodologia, resultados e limitações.",
    },
    prompt: {
      en: "Summarize the following medical text, highlighting methodology, key results, limitations and clinical implications:\n\n",
      pt: "Resume o seguinte texto médico, destacando metodologia, resultados principais, limitações e implicações clínicas:\n\n",
    },
  },
  {
    id: "veterinary-diagnosis",
    category: "veterinary",
    title: {
      en: "Veterinary case assistant",
      pt: "Assistente de caso veterinário",
    },
    systemPrompt: {
      en: "You are a veterinary medicine assistant. Provide structured, species-aware guidance and always recommend veterinary consultation for diagnosis and treatment.",
      pt: "És um assistente de medicina veterinária. Dá orientação estruturada e adaptada à espécie e recomenda sempre consulta veterinária para diagnóstico e tratamento.",
    },
    prompt: {
      en: "Help me analyse this veterinary case. Consider species, breed, age and clinical signs. Suggest differentials and diagnostic work-up.",
      pt: "Ajuda-me a analisar este caso veterinário. Considera espécie, raça, idade e sinais clínicos. Sugere diferenciais e plano de diagnóstico.",
    },
  },
  {
    id: "pharmacy-interactions",
    category: "pharmacy",
    title: {
      en: "Drug interaction checker",
      pt: "Interações medicamentosas",
    },
    systemPrompt: {
      en: "You are a clinical pharmacist assistant. Analyse drug interactions, contraindications and dosing carefully. Always advise confirming with authoritative references.",
      pt: "És um assistente de farmacêutico clínico. Analisa interações, contraindicações e posologia com rigor. Aconselha sempre a confirmar em fontes de referência.",
    },
    prompt: {
      en: "Analyse potential drug interactions, contraindications and dosing considerations for the following medication list:\n\n",
      pt: "Analisa possíveis interações, contraindicações e considerações de posologia da seguinte lista de medicamentos:\n\n",
    },
  },
  {
    id: "research-methodology",
    category: "research",
    title: {
      en: "Research methodology advisor",
      pt: "Metodologia de investigação",
    },
    systemPrompt: {
      en: "You are a research methodology expert. Advise on study design, statistics, bias and reproducibility with precision.",
      pt: "És um especialista em metodologia. Aconselha desenho do estudo, estatística, viés e reprodutibilidade com precisão.",
    },
    prompt: {
      en: "Review my research question and proposed methodology. Identify strengths, weaknesses, potential biases and suggest improvements.",
      pt: "Revê a minha pergunta de investigação e a metodologia proposta. Identifica pontos fortes, fracos, vieses possíveis e sugere melhorias.",
    },
  },
  {
    id: "research-writing",
    category: "research",
    title: {
      en: "Scientific writing assistant",
      pt: "Escrita científica",
    },
    systemPrompt: {
      en: "You are a scientific writing editor. Improve clarity, structure and precision while preserving the author's meaning and scientific accuracy.",
      pt: "És um revisor de escrita científica. Melhora clareza, estrutura e precisão, preservando o sentido do autor e o rigor científico.",
    },
    prompt: {
      en: "Review and improve the following scientific text for clarity, structure and academic tone:\n\n",
      pt: "Revê e melhora o seguinte texto científico quanto a clareza, estrutura e tom académico:\n\n",
    },
  },
  {
    id: "programming-review",
    category: "programming",
    title: { en: "Code reviewer", pt: "Revisão de código" },
    systemPrompt: {
      en: "You are a senior software engineer performing a code review. Be constructive, point out bugs, security issues and suggest concrete improvements.",
      pt: "És um engenheiro de software sénior a rever código. Sê construtivo, aponta erros e problemas de segurança e sugere melhorias concretas.",
    },
    prompt: {
      en: "Review the following code. Identify bugs, security issues, performance problems and suggest improvements:\n\n",
      pt: "Revê o seguinte código. Identifica erros, problemas de segurança, desempenho e sugere melhorias:\n\n",
    },
  },
  {
    id: "programming-explain",
    category: "programming",
    title: { en: "Explain code", pt: "Explicar código" },
    systemPrompt: {
      en: "You are a patient programming tutor. Explain code clearly, step by step, for a developer audience.",
      pt: "És um tutor de programação paciente. Explica o código com clareza, passo a passo, para programadores.",
    },
    prompt: {
      en: "Explain the following code step by step, including its purpose, key parts and any gotchas:\n\n",
      pt: "Explica o seguinte código passo a passo, incluindo o propósito, as partes principais e as armadilhas:\n\n",
    },
  },
  {
    id: "marketing-copy",
    category: "marketing",
    title: { en: "Marketing copywriter", pt: "Texto de marketing" },
    systemPrompt: {
      en: "You are a marketing copywriter. Write persuasive, audience-focused copy that is clear, benefit-driven and honest.",
      pt: "És um redator de marketing. Escreve texto persuasivo, claro, centrado no benefício e honesto.",
    },
    prompt: {
      en: "Write marketing copy for the following product or service. Include a headline, a short body and a call to action:\n\n",
      pt: "Escreve texto de marketing para o seguinte produto ou serviço. Inclui título, corpo curto e chamada para ação:\n\n",
    },
  },
  {
    id: "legal-review",
    category: "legal",
    title: { en: "Legal document assistant", pt: "Texto jurídico" },
    systemPrompt: {
      en: "You are a legal assistant. Provide general information only, flag jurisdictional issues, and always recommend review by a qualified lawyer.",
      pt: "És um assistente jurídico. Dás apenas informação geral, assinalas questões de jurisdição e recomendas sempre revisão por um advogado.",
    },
    prompt: {
      en: "Review the following legal text or clause. Explain it in plain language, flag risks and suggest improvements:\n\n",
      pt: "Revê o seguinte texto ou cláusula. Explica-o em linguagem clara, assinala riscos e sugere melhorias:\n\n",
    },
  },
  {
    id: "education-lesson",
    category: "education",
    title: { en: "Lesson planner", pt: "Plano de aula" },
    systemPrompt: {
      en: "You are an experienced teacher. Create clear learning objectives, explanations and activities adapted to the student's level.",
      pt: "És um professor experiente. Cria objetivos de aprendizagem, explicações e atividades claras, adaptadas ao nível do aluno.",
    },
    prompt: {
      en: "Create a lesson plan about the following topic, including learning objectives, explanation, an activity and an assessment question.",
      pt: "Cria um plano de aula sobre o seguinte tema, com objetivos de aprendizagem, explicação, uma atividade e uma pergunta de avaliação.",
    },
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
