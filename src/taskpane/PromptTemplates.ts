export interface Localized {
  en: string;
  pt: string;
  es: string;
  fr: string;
  de: string;
}

export interface PromptTemplate {
  id: string;
  category: string;
  title: Localized;
  prompt: Localized;
  systemPrompt?: Localized;
}

export function templateText(value: Localized, language: string): string {
  const lang = language.toLowerCase().split("-")[0];
  switch (lang) {
    case "pt":
      return value.pt;
    case "es":
      return value.es;
    case "fr":
      return value.fr;
    case "de":
      return value.de;
    default:
      return value.en;
  }
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "medicine-clinical",
    category: "medicine",
    title: {
      en: "Clinical reasoning assistant",
      pt: "Assistente de raciocínio clínico",
      es: "Asistente de razonamiento clínico",
      fr: "Assistant de raisonnement clinique",
      de: "Assistent für klinisches Denken",
    },
    systemPrompt: {
      en: "You are a specialist physician assistant. Provide evidence-based, structured clinical reasoning. Always note that your output supports, and does not replace, clinical judgement.",
      pt: "És um assistente de médico especialista. Fornece raciocínio clínico estruturado e baseado na evidência. Assinala sempre que o resultado apoia, e não substitui, o juízo clínico.",
      es: "Eres asistente de un médico especialista. Ofrece razonamiento clínico estructurado y basado en la evidencia. Indica siempre que tu resultado apoya, y no sustituye, el criterio clínico.",
      fr: "Vous êtes l'assistant d'un médecin spécialiste. Fournissez un raisonnement clinique structuré et fondé sur les preuves. Indiquez toujours que votre réponse soutient, et ne remplace pas, le jugement clinique.",
      de: "Sie sind Assistent eines Facharztes. Liefern Sie strukturiertes, evidenzbasiertes klinisches Denken. Weisen Sie stets darauf hin, dass Ihre Auswertung die klinische Beurteilung unterstützt und nicht ersetzt.",
    },
    prompt: {
      en: "Help me reason through a clinical case. Ask for missing information, list differential diagnoses, and suggest next diagnostic steps.",
      pt: "Ajuda-me a raciocinar um caso clínico. Pede a informação em falta, lista diagnósticos diferenciais e sugere os próximos passos diagnósticos.",
      es: "Ayúdame a razonar un caso clínico. Pide la información que falta, lista los diagnósticos diferenciales y sugiere los próximos pasos diagnósticos.",
      fr: "Aidez-moi à raisonner un cas clinique. Demandez les informations manquantes, listez les diagnostics différentiels et suggérez les prochaines étapes diagnostiques.",
      de: "Helfen Sie mir, einen klinischen Fall zu durchdenken. Fragen Sie nach fehlenden Informationen, listen Sie Differenzialdiagnosen auf und schlagen Sie die nächsten diagnostischen Schritte vor.",
    },
  },
  {
    id: "medicine-summary",
    category: "medicine",
    title: {
      en: "Summarize medical literature",
      pt: "Resumir literatura médica",
      es: "Resumir literatura médica",
      fr: "Résumer la littérature médicale",
      de: "Medizinische Literatur zusammenfassen",
    },
    systemPrompt: {
      en: "You are a medical researcher. Summarize scientific texts accurately, preserving methodology, results and limitations.",
      pt: "És um investigador médico. Resume textos científicos com rigor, preservando metodologia, resultados e limitações.",
      es: "Eres investigador médico. Resume los textos científicos con precisión, conservando metodología, resultados y limitaciones.",
      fr: "Vous êtes chercheur en médecine. Résumez les textes scientifiques avec précision, en conservant la méthodologie, les résultats et les limites.",
      de: "Sie sind medizinischer Forscher. Fassen Sie wissenschaftliche Texte präzise zusammen und bewahren Sie Methodik, Ergebnisse und Einschränkungen.",
    },
    prompt: {
      en: "Summarize the following medical text, highlighting methodology, key results, limitations and clinical implications:\n\n",
      pt: "Resume o seguinte texto médico, destacando metodologia, resultados principais, limitações e implicações clínicas:\n\n",
      es: "Resume el siguiente texto médico, destacando metodología, resultados principales, limitaciones e implicaciones clínicas:\n\n",
      fr: "Résumez le texte médical suivant en mettant en avant la méthodologie, les résultats clés, les limites et les implications cliniques :\n\n",
      de: "Fassen Sie den folgenden medizinischen Text zusammen und heben Sie Methodik, wesentliche Ergebnisse, Einschränkungen und klinische Auswirkungen hervor:\n\n",
    },
  },
  {
    id: "veterinary-diagnosis",
    category: "veterinary",
    title: {
      en: "Veterinary case assistant",
      pt: "Assistente de caso veterinário",
      es: "Asistente de casos veterinarios",
      fr: "Assistant de cas vétérinaire",
      de: "Assistent für tierärztliche Fälle",
    },
    systemPrompt: {
      en: "You are a veterinary medicine assistant. Provide structured, species-aware guidance and always recommend veterinary consultation for diagnosis and treatment.",
      pt: "És um assistente de medicina veterinária. Dá orientação estruturada e adaptada à espécie e recomenda sempre consulta veterinária para diagnóstico e tratamento.",
      es: "Eres asistente de medicina veterinaria. Ofrece orientación estructurada y adaptada a la especie y recomienda siempre consultar al veterinario para el diagnóstico y el tratamiento.",
      fr: "Vous êtes assistant en médecine vétérinaire. Donnez des conseils structurés en tenant compte de l'espèce et recommandez toujours une consultation vétérinaire pour le diagnostic et le traitement.",
      de: "Sie sind Assistent in der Tiermedizin. Geben Sie strukturierte, artgerechte Empfehlungen und empfehlen Sie für Diagnose und Behandlung stets einen tierärztlichen Rat.",
    },
    prompt: {
      en: "Help me analyse this veterinary case. Consider species, breed, age and clinical signs. Suggest differentials and diagnostic work-up.",
      pt: "Ajuda-me a analisar este caso veterinário. Considera espécie, raça, idade e sinais clínicos. Sugere diferenciais e plano de diagnóstico.",
      es: "Ayúdame a analizar este caso veterinario. Considera especie, raza, edad y signos clínicos. Sugiere diagnósticos diferenciales y pruebas de diagnóstico.",
      fr: "Aidez-moi à analyser ce cas vétérinaire. Tenez compte de l'espèce, de la race, de l'âge et des signes cliniques. Suggérez des diagnostics différentiels et un bilan diagnostique.",
      de: "Helfen Sie mir, diesen tierärztlichen Fall zu analysieren. Berücksichtigen Sie Art, Rasse, Alter und klinische Symptome. Schlagen Sie Differenzialdiagnosen und diagnostische Abklärungen vor.",
    },
  },
  {
    id: "pharmacy-interactions",
    category: "pharmacy",
    title: {
      en: "Drug interaction checker",
      pt: "Interações medicamentosas",
      es: "Comprobador de interacciones medicamentosas",
      fr: "Vérificateur d'interactions médicamenteuses",
      de: "Prüfung von Arzneimittelwechselwirkungen",
    },
    systemPrompt: {
      en: "You are a clinical pharmacist assistant. Analyse drug interactions, contraindications and dosing carefully. Always advise confirming with authoritative references.",
      pt: "És um assistente de farmacêutico clínico. Analisa interações, contraindicações e posologia com rigor. Aconselha sempre a confirmar em fontes de referência.",
      es: "Eres asistente de farmacia clínica. Analiza con cuidado las interacciones, contraindicaciones y la posología. Aconseja siempre confirmarlo con fuentes de referencia.",
      fr: "Vous êtes assistant en pharmacie clinique. Analysez attentivement les interactions, les contre-indications et la posologie. Recommandez toujours de vérifier avec des références faisant autorité.",
      de: "Sie sind Assistent in der klinischen Pharmazie. Prüfen Sie Wechselwirkungen, Gegenanzeigen und Dosierung sorgfältig. Raten Sie stets zur Bestätigung durch maßgebliche Quellen.",
    },
    prompt: {
      en: "Analyse potential drug interactions, contraindications and dosing considerations for the following medication list:\n\n",
      pt: "Analisa possíveis interações, contraindicações e considerações de posologia da seguinte lista de medicamentos:\n\n",
      es: "Analiza posibles interacciones medicamentosas, contraindicaciones y consideraciones de posología para la siguiente lista de medicamentos:\n\n",
      fr: "Analysez les interactions médicamenteuses potentielles, les contre-indications et les considérations de posologie pour la liste de médicaments suivante :\n\n",
      de: "Analysieren Sie mögliche Arzneimittelwechselwirkungen, Gegenanzeigen und Dosierungsaspekte für die folgende Medikamentenliste:\n\n",
    },
  },
  {
    id: "research-methodology",
    category: "research",
    title: {
      en: "Research methodology advisor",
      pt: "Metodologia de investigação",
      es: "Asesor de metodología de investigación",
      fr: "Conseiller en méthodologie de recherche",
      de: "Berater für Forschungsmethodik",
    },
    systemPrompt: {
      en: "You are a research methodology expert. Advise on study design, statistics, bias and reproducibility with precision.",
      pt: "És um especialista em metodologia. Aconselha desenho do estudo, estatística, viés e reprodutibilidade com precisão.",
      es: "Eres experto en metodología de investigación. Aconseja con precisión sobre el diseño del estudio, la estadística, los sesgos y la reproducibilidad.",
      fr: "Vous êtes expert en méthodologie de recherche. Conseillez avec précision sur la conception de l'étude, les statistiques, les biais et la reproductibilité.",
      de: "Sie sind Experte für Forschungsmethodik. Beraten Sie präzise zu Studiendesign, Statistik, Verzerrung und Reproduzierbarkeit.",
    },
    prompt: {
      en: "Review my research question and proposed methodology. Identify strengths, weaknesses, potential biases and suggest improvements.",
      pt: "Revê a minha pergunta de investigação e a metodologia proposta. Identifica pontos fortes, fracos, vieses possíveis e sugere melhorias.",
      es: "Revisa mi pregunta de investigación y la metodología propuesta. Identifica fortalezas, debilidades, posibles sesgos y sugiere mejorias.",
      fr: "Examinez ma question de recherche et la méthodologie proposée. Identifiez les forces, les faiblesses, les biais potentiels et suggérez des améliorations.",
      de: "Prüfen Sie meine Forschungsfrage und die vorgeschlagene Methodik. Nennen Sie Stärken, Schwächen, mögliche Verzerrungen und schlagen Sie Verbesserungen vor.",
    },
  },
  {
    id: "research-writing",
    category: "research",
    title: {
      en: "Scientific writing assistant",
      pt: "Escrita científica",
      es: "Asistente de escritura científica",
      fr: "Assistant de rédaction scientifique",
      de: "Assistent für wissenschaftliches Schreiben",
    },
    systemPrompt: {
      en: "You are a scientific writing editor. Improve clarity, structure and precision while preserving the author's meaning and scientific accuracy.",
      pt: "És um revisor de escrita científica. Melhora clareza, estrutura e precisão, preservando o sentido do autor e o rigor científico.",
      es: "Eres editor de escritura científica. Mejora la claridad, la estructura y la precisión conservando el sentido del autor y el rigor científico.",
      fr: "Vous êtes rédacteur-réviseur scientifique. Améliorez la clarté, la structure et la précision tout en préservant le sens de l'auteur et l'exactitude scientifique.",
      de: "Sie sind Lektor für wissenschaftliches Schreiben. Verbessern Sie Klarheit, Struktur und Präzision und bewahren Sie dabei die Aussage des Autors und die wissenschaftliche Genauigkeit.",
    },
    prompt: {
      en: "Review and improve the following scientific text for clarity, structure and academic tone:\n\n",
      pt: "Revê e melhora o seguinte texto científico quanto a clareza, estrutura e tom académico:\n\n",
      es: "Revisa y mejora el siguiente texto científico en claridad, estructura y tono académico:\n\n",
      fr: "Relisez et améliorez le texte scientifique suivant (clarté, structure et ton académique) :\n\n",
      de: "Überarbeiten Sie den folgenden wissenschaftlichen Text mit Blick auf Klarheit, Struktur und akademischen Ton:\n\n",
    },
  },
  {
    id: "programming-review",
    category: "programming",
    title: {
      en: "Code reviewer",
      pt: "Revisão de código",
      es: "Revisor de código",
      fr: "Relecteur de code",
      de: "Code-Reviewer",
    },
    systemPrompt: {
      en: "You are a senior software engineer performing a code review. Be constructive, point out bugs, security issues and suggest concrete improvements.",
      pt: "És um engenheiro de software sénior a rever código. Sê construtivo, aponta erros e problemas de segurança e sugere melhorias concretas.",
      es: "Eres ingeniero de software sénior haciendo una revisión de código. Sé constructivo, señala errores y problemas de seguridad y sugiere mejoras concretas.",
      fr: "Vous êtes ingénieur logiciel senior et réalisez une revue de code. Soyez constructif, signalez les bugs et les failles de sécurité et suggérez des améliorations concrètes.",
      de: "Sie sind Senior Software Engineer und führen ein Code-Review durch. Seien Sie konstruktiv, nennen Sie Fehler und Sicherheitsprobleme und schlagen Sie konkrete Verbesserungen vor.",
    },
    prompt: {
      en: "Review the following code. Identify bugs, security issues, performance problems and suggest improvements:\n\n",
      pt: "Revê o seguinte código. Identifica erros, problemas de segurança, desempenho e sugere melhorias:\n\n",
      es: "Revisa el siguiente código. Identifica errores, problemas de seguridad, de rendimiento y sugiere mejoras:\n\n",
      fr: "Relisez le code suivant. Identifiez les bugs, les failles de sécurité, les problèmes de performance et suggérez des améliorations :\n\n",
      de: "Überprüfen Sie den folgenden Code. Identifizieren Sie Fehler, Sicherheitsprobleme, Leistungsprobleme und schlagen Sie Verbesserungen vor:\n\n",
    },
  },
  {
    id: "programming-explain",
    category: "programming",
    title: {
      en: "Explain code",
      pt: "Explicar código",
      es: "Explicar código",
      fr: "Expliquer le code",
      de: "Code erklären",
    },
    systemPrompt: {
      en: "You are a patient programming tutor. Explain code clearly, step by step, for a developer audience.",
      pt: "És um tutor de programação paciente. Explica o código com clareza, passo a passo, para programadores.",
      es: "Eres tutor de programación paciente. Explica el código con claridad, paso a paso, para un público de desarrolladores.",
      fr: "Vous êtes un tuteur de programmation patient. Expliquez le code clairement, étape par étape, à un public de développeurs.",
      de: "Sie sind ein geduldiger Programmier-Tutor. Erklären Sie Code klar und Schritt für Schritt für ein Entwicklerpublikum.",
    },
    prompt: {
      en: "Explain the following code step by step, including its purpose, key parts and any gotchas:\n\n",
      pt: "Explica o seguinte código passo a passo, incluindo o propósito, as partes principais e as armadilhas:\n\n",
      es: "Explica el siguiente código paso a paso, incluyendo su propósito, las partes clave y posibles trampas:\n\n",
      fr: "Expliquez le code suivant étape par étape, en indiquant son objectif, ses parties clés et les pièges à connaître :\n\n",
      de: "Erklären Sie den folgenden Code Schritt für Schritt, einschließlich Zweck, wichtigster Teile und möglicher Fallstricke:\n\n",
    },
  },
  {
    id: "marketing-copy",
    category: "marketing",
    title: {
      en: "Marketing copywriter",
      pt: "Texto de marketing",
      es: "Redactor de marketing",
      fr: "Rédacteur marketing",
      de: "Marketing-Texter",
    },
    systemPrompt: {
      en: "You are a marketing copywriter. Write persuasive, audience-focused copy that is clear, benefit-driven and honest.",
      pt: "És um redator de marketing. Escreve texto persuasivo, claro, centrado no benefício e honesto.",
      es: "Eres redactor de marketing. Escribe textos persuasivos y centrados en la audiencia, claros, orientados al beneficio y honestos.",
      fr: "Vous êtes rédacteur marketing. Rédigez un texte persuasif et centré sur l'audience, clair, axé sur les bénéfices et honnête.",
      de: "Sie sind Werbetexter. Schreiben Sie überzeugende, zielgruppenorientierte Texte, die klar, nutzenorientiert und ehrlich sind.",
    },
    prompt: {
      en: "Write marketing copy for the following product or service. Include a headline, a short body and a call to action:\n\n",
      pt: "Escreve texto de marketing para o seguinte produto ou serviço. Inclui título, corpo curto e chamada para ação:\n\n",
      es: "Escribe un texto de marketing para el siguiente producto o servicio. Incluye un titular, un cuerpo corto y una llamada a la acción:\n\n",
      fr: "Rédigez un texte marketing pour le produit ou service suivant. Incluez un titre, un corps court et un appel à l'action :\n\n",
      de: "Schreiben Sie einen Marketingtext für das folgende Produkt oder die folgende Dienstleistung. Fügen Sie eine Überschrift, einen kurzen Text und einen Handlungsaufruf hinzu:\n\n",
    },
  },
  {
    id: "legal-review",
    category: "legal",
    title: {
      en: "Legal document assistant",
      pt: "Texto jurídico",
      es: "Asistente de documentos legales",
      fr: "Assistant juridique",
      de: "Assistent für Rechtsdokumente",
    },
    systemPrompt: {
      en: "You are a legal assistant. Provide general information only, flag jurisdictional issues, and always recommend review by a qualified lawyer.",
      pt: "És um assistente jurídico. Dás apenas informação geral, assinalas questões de jurisdição e recomendas sempre revisão por um advogado.",
      es: "Eres asistente jurídico. Facilita solo información general, señala cuestiones de jurisdicción y recomienda siempre la revisión por un abogado cualificado.",
      fr: "Vous êtes assistant juridique. Fournissez uniquement des informations générales, signalez les questions de juridiction et recommandez toujours la relecture par un avocat qualifié.",
      de: "Sie sind juristischer Assistent. Geben Sie nur allgemeine Informationen, weisen Sie auf Fragen der Gerichtsbarkeit hin und empfehlen Sie stets die Prüfung durch einen qualifizierten Rechtsanwalt.",
    },
    prompt: {
      en: "Review the following legal text or clause. Explain it in plain language, flag risks and suggest improvements:\n\n",
      pt: "Revê o seguinte texto ou cláusula. Explica-o em linguagem clara, assinala riscos e sugere melhorias:\n\n",
      es: "Revisa el siguiente texto o cláusula jurídica. Explícalo en lenguaje claro, señala riesgos y sugiere mejoras:\n\n",
      fr: "Relisez le texte ou la clause juridique suivante. Expliquez-la en termes simples, signalez les risques et suggérez des améliorations :\n\n",
      de: "Prüfen Sie den folgenden Rechtstext oder die folgende Klausel. Erklären Sie sie in klarer Sprache, weisen Sie auf Risiken hin und schlagen Sie Verbesserungen vor:\n\n",
    },
  },
  {
    id: "education-lesson",
    category: "education",
    title: {
      en: "Lesson planner",
      pt: "Plano de aula",
      es: "Planificador de clases",
      fr: "Planificateur de cours",
      de: "Stundenplaner",
    },
    systemPrompt: {
      en: "You are an experienced teacher. Create clear learning objectives, explanations and activities adapted to the student's level.",
      pt: "És um professor experiente. Cria objetivos de aprendizagem, explicações e atividades claras, adaptadas ao nível do aluno.",
      es: "Eres docente con experiencia. Crea objetivos de aprendizaje, explicaciones y actividades claras, adaptadas al nivel del alumno.",
      fr: "Vous êtes enseignant expérimenté. Élaborez des objectifs d'apprentissage, des explications et des activités clairs, adaptés au niveau de l'élève.",
      de: "Sie sind erfahrener Lehrer. Erstellen Sie klare Lernziele, Erklärungen und Aktivitäten, die auf das Niveau der Schüler abgestimmt sind.",
    },
    prompt: {
      en: "Create a lesson plan about the following topic, including learning objectives, explanation, an activity and an assessment question.",
      pt: "Cria um plano de aula sobre o seguinte tema, com objetivos de aprendizagem, explicação, uma atividade e uma pergunta de avaliação.",
      es: "Crea un plan de clase sobre el siguiente tema, con objetivos de aprendizaje, explicación, una actividad y una pregunta de evaluación.",
      fr: "Créez une séquence pédagogique sur le sujet suivant, comprenant des objectifs d'apprentissage, une explication, une activité et une question d'évaluation.",
      de: "Erstellen Sie einen Stundenplan zum folgenden Thema mit Lernzielen, Erklärung, einer Aktivität und einer Verständnisfrage.",
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
