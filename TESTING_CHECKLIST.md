# Checklist de Testes Reais — Office Universal AI

Este documento é o **plano executável** para os testes reais no Microsoft Office.
Cada linha deve ser preenchida durante a execução: marcar ✅ (passou), ❌ (falhou) ou ⏭️ (não aplicável), registar a versão do Office/SO e guardar evidência (screenshot, vídeo ou log).

> **Regra de ouro**: usar sempre **documentos de teste novos**, nunca documentos reais de trabalho.

---

## 0. Preparação do ambiente (pré-requisito — tudo tem de estar ✅ antes de começar)

| # | Item | Estado | Notas / quem configura |
|---|---|---|---|
| 0.1 | Máquina **Windows 10/11** com Microsoft 365 Desktop (Word, Excel, PowerPoint) instalado e atualizado | ☐ | Versão do Office: _______ |
| 0.2 | Conta **Microsoft 365** com sessão iniciada (para Office Web) | ☐ | Utilizador: _______ |
| 0.3 | **macOS** com Office Desktop (opcional, fase 2) | ☐ | Versão: _______ |
| 0.4 | Node.js >= 20.19 instalado no ambiente de teste | ☐ | `node --version`: _______ |
| 0.5 | Projeto clonado e `npm ci` executado sem erros | ☐ | Commit testado: _______ |
| 0.6 | `npm start` corre e `https://localhost:3000` abre no browser | ☐ | Certificado HTTPS aceite no OS |
| 0.7 | `npm test` passa 277/277 localmente | ☐ | |
| 0.8 | `npm run validate` → "Manifest accepted" | ☐ | |
| 0.9 | API key de teste **Mistral** (mínimo obrigatório) | ☐ | Quota disponível: _______ |
| 0.10 | API key de teste **OpenAI** ou **Claude** + proxy Worker deployed com `ALLOWED_ORIGINS` | ☐ | URL do proxy: _______ |
| 0.11 | API key de teste **Gemini** (free tier serve) | ☐ | |
| 0.12 | API key de teste **OpenRouter** | ☐ | |
| 0.13 | **Ollama** instalado localmente com pelo menos 1 modelo (`ollama pull llama3.2`) | ☐ | Modelo: _______ |
| 0.14 | Documento de teste Word vazio criado | ☐ | `teste-word.docx` |
| 0.15 | Folha de cálculo de teste criada | ☐ | `teste-excel.xlsx` com dados de exemplo |
| 0.16 | Apresentação de teste criada | ☐ | `teste-pptx.pptx` com 2-3 slides de texto |
| 0.17 | Second conta/utilizador para testes de coautoria (opcional) | ☐ | |

---

## 1. Instalação e carregamento (todos os hosts)

| # | Host | Plataforma | Cenário | Resultado | Versão Office | Evidência | Notas |
|---|---|---|---|---|---|---|---|
| 1.1 | Word | Windows Desktop | Sideload via `npm run sideload` ou Insert → Get Add-ins → Upload manifest.xml. Grupo "AI Assistant" aparece no friso Página Inicial | ☐ | | | |
| 1.2 | Excel | Windows Desktop | Mesmo processo. Friso visível | ☐ | | | |
| 1.3 | PowerPoint | Windows Desktop | Mesmo processo. Friso visível | ☐ | | | |
| 1.4 | Word | Office Web | Build de produção alojado em HTTPS (ou túnel), manifest atualizado, upload no office.com | ☐ | | | |
| 1.5 | Excel | Office Web | Mesmo processo | ☐ | | | |
| 1.6 | PowerPoint | Office Web | Mesmo processo | ☐ | | | |
| 1.7 | Word | macOS Desktop | Sideload no Mac. Certificado HTTPS aceite no Keychain | ☐ | | | |
| 1.8 | — | Todas | Clicar **Open Chat** → taskpane abre sem erros (verificar consola F12) | ☐ | | | |
| 1.9 | — | Todas | Ícones do friso aparecem corretamente (16/32/80px) | ☐ | | | |

---

## 2. Configuração inicial (Settings)

| # | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|
| 2.1 | Abrir Settings (⚙️). Todos os 6 fornecedores listados: Mistral, OpenAI, Claude, Gemini, OpenRouter, Ollama | ☐ | | |
| 2.2 | Inserir API key Mistral + clicar **Test connection** → resposta OK com lista de modelos | ☐ | | |
| 2.3 | Inserir API key OpenAI + ativar **Use proxy** + URL do Worker + Test connection → OK | ☐ | | |
| 2.4 | Testar cada fornecedor individualmente (2.2–2.3 repetido para Claude, Gemini, OpenRouter) | ☐ | | |
| 2.5 | Ollama: Test connection em Desktop → OK com modelos locais listados | ☐ | | |
| 2.6 | Ollama em Office Web → aviso de incompatibilidade aparece (não deve funcionar) | ☐ | | |
| 2.7 | Guardar settings → recarregar o add-in → keys persistem (cifradas, não em texto plano) | ☐ | | Verificar DevTools → Application → Storage |
| 2.8 | Ativar **passphrase (cofre)** → definir frase-passe → bloquear → desbloquear → dados recuperados | ☐ | | |
| 2.9 | Bloquear cofre durante uma ação em curso → ação cancelada, sem writes | ☐ | | |
| 2.10 | Mudar idioma (PT/EN/ES/FR/DE) → UI traduzida em todos os ecrãs | ☐ | | |
| 2.11 | Mudar tema (Light/Dark/Auto) → taskpane segue | ☐ | | |
| 2.12 | Temperature e Max tokens guardam e aplicam | ☐ | | |
| 2.13 | System prompt guarda e é enviado nos pedidos | ☐ | | |

---

## 3. Chat básico e streaming (todos os hosts, pelo menos 1 fornecedor)

| # | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|
| 3.1 | Enviar mensagem simples no chat → resposta aparece com streaming token-a-token | ☐ | | |
| 3.2 | Resposta completa aparece no histórico após terminar | ☐ | | |
| 3.3 | Nova conversa (New chat) → histórico anterior preservado na vista History | ☐ | | |
| 3.4 | Carregar conversa antiga do histórico → mensagens restauradas | ☐ | | |
| 3.5 | Parar (Stop) durante streaming → parcial guardada uma única vez, marcada como incompleta | ☐ | | |
| 3.6 | Iniciar novo chat durante streaming → operación antiga cancelada, sem duplicação | ☐ | | |
| 3.7 | Regenerar última resposta → nova resposta substitui/ adiciona corretamente | ☐ | | |
| 3.8 | Erro de rede/API (key inválida) → mensagem de erro amigável traduzida, sem crash | ☐ | | |
| 3.9 | Timeout configurado baixo → erro TIMEOUT amigável | ☐ | | |
| 3.10 | Chat com contexto: selecionar texto no documento → enviar "resume isto" → resposta usa o contexto | ☐ | | |

---

## 4. Word — ações específicas

Documento de teste: `teste-word.docx` com texto de exemplo.

| # | Ação | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|---|
| 4.1 | Summarize (friso ou quick action) | Selecionar parágrafo → Summarize → resumo aparece no chat | ☐ | | |
| 4.2 | Explain | Selecionar termo técnico → Explain → explicação no chat | ☐ | | |
| 4.3 | Rewrite | Selecionar frase → Rewrite → texto reescrito aplicado **in-place** na seleção | ☐ | | |
| 4.4 | Translate | Selecionar texto PT → Translate → escolher EN → texto traduzido no documento | ☐ | | |
| 4.5 | Fix grammar | Frase com erro gramatical → Fix → corrigida in-place | ☐ | | |
| 4.6 | Generate & insert | Prompt "escreve uma introdução" → Generate → texto inserido no fim do documento | ☐ | | |
| 4.7 | Conflito: alterar texto selecionado durante a resposta da IA | Rewrite → durante o pedido, editar o texto original → deve aparecer aviso de conflito, texto original preservado, resultado no chat | ☐ | | |
| 4.8 | Seleção > 60 001 caracteres (MAX_CONTEXT_CHARS) | Tentar substituir seleção gigante → recusado com aviso de truncamento/limite | ☐ | | |
| 4.9 | Mudar seleção durante o pedido | Iniciar ação numa seleção, mudar para outra → destino original preservado (não escreve no novo) | ☐ | | |
| 4.10 | Comando do friso com taskpane fechado | Clicar Summarize no friso sem painel aberto → abre painel + executa | ☐ | | |
| 4.11 | Inserir última resposta (Insert) | Após receber resposta no chat → Insert → texto inserido na seleção atual do Word | ☐ | | |

---

## 5. Excel — ações específicas

Folha de teste: `teste-excel.xlsx` com tabela de dados e fórmulas.

| # | Ação | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|---|
| 5.1 | Explain formula | Selecionar célula com fórmula → Explain formula → explicação no chat | ☐ | | |
| 5.2 | Generate formula | Descrever resultado desejado → Generate formula → fórmula inserida na célula ativa | ☐ | | |
| 5.3 | Analyse table | Selecionar intervalo de dados → Analyse → análise no chat | ☐ | | |
| 5.4 | Translate range | Selecionar células PT → Translate → traduzidas in-place | ☐ | | |
| 5.5 | Generate VBA | Pedir macro → código VBA no chat | ☐ | | |
| 5.6 | Generate Office Script | Pedir script → código no chat | ☐ | | |
| 5.7 | Inserção manual na célula | Insert após resposta → texto na célula ativa | ☐ | | |
| 5.8 | Mudar de célula durante geração de fórmula | Iniciar Generate formula, mudar célula ativa durante pedido → não escreve na célula errada | ☐ | | |
| 5.9 | Seleção de coluna/folha inteira grande | Analisar seleção muito grande → truncamento aplicado com aviso (limite MAX_CONTEXT_CHARS) | ☐ | | |
| 5.10 | Editar célula durante a resposta | Conflito → aviso, valor original preservado | ☐ | | |

---

## 6. PowerPoint — ações específicas

Apresentação de teste: `teste-pptx.pptx` com 2-3 slides de texto.

| # | Ação | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|---|
| 6.1 | Improve slide | Slide com texto → Improve → texto melhorado escrito nos shapes | ☐ | | |
| 6.2 | Fix grammar | Texto com erro → Fix → corrigido in-place | ☐ | | |
| 6.3 | Translate slide | Slide PT → Translate → traduzido in-place | ☐ | | |
| 6.4 | Explain slide | Slide técnico → Explain → explicação no chat, slide inalterado | ☐ | | |
| 6.5 | Speaker notes | Slide → Speaker notes → notas escritas no painel de notas | ☐ | | |
| 6.6 | Summarize presentation | Múltiplos slides → Summarize → resumo no chat | ☐ | | |
| 6.7 | Create presentation | Tópico + nº slides + idioma → slides criados no deck com título e bullets | ☐ | | |
| 6.8 | Cancelar durante criação de slides | Create → Parar durante a criação → slides parciais preservados, aviso de criação parcial | ☐ | | |
| 6.9 | Editar shape durante a resposta | Improve → editar texto do shape durante pedido → conflito detetado, original preservado, resultado no chat | ☐ | | |
| 6.10 | Eliminar shape durante a resposta | Improve → eliminar shape durante pedido → nenhum write nesse shape, aviso de conflito | ☐ | | |
| 6.11 | Slide vazio | Ação num slide sem texto → erro "no text" amigável | ☐ | | |
| 6.12 | Inserir texto (Insert) | Após resposta → Insert → text box adicionada ao slide | ☐ | | |
| 6.13 | Slide com imagem + texto + placeholder sem texto | Ação → apenas shapes de texto são lidos/modificados, imagem intacta | ☐ | | |

---

## 7. Comandos do friso (ribbon) — todos os hosts

| # | Botão | Cenário | Resultado | Notas |
|---|---|---|---|---|
| 7.1 | **Open Chat** | Abre o taskpane | ☐ | |
| 7.2 | **Summarize** | Executa summarize no host ativo (seleção ou documento) | ☐ | |
| 7.3 | **Translate** | Abre dialog de idioma → traduz seleção | ☐ | |
| 7.4 | **Analyse** | Executa análise apropriada ao host (Word=explain, Excel=analyse table, PP=explain slide) | ☐ | |
| 7.5 | **Settings** | Abre o taskpane no separador Settings | ☐ | |
| 7.6 | Comando com painel já aberto | Não duplica painel, foca o existente | ☐ | |
| 7.7 | Comando durante outra operação em curso | Bloqueado ou enfileirado (não duplica) | ☐ | |

---

## 8. Fornecedores reais (integração end-to-end)

Para cada fornecedor, executar: Test connection → listar modelos → enviar mensagem no chat (streaming) → usar uma quick action.

| # | Fornecedor | Condição | Test conn | Catálogo modelos | Chat stream | Quick action | Chaves seguras* | Resultado | Notas |
|---|---|---|---|---|---|---|---|---|---|
| 8.1 | Mistral | Chave + endpoint direto | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| 8.2 | OpenAI | Chave + proxy HTTPS | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| 8.3 | Claude | Chave + proxy HTTPS | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| 8.4 | Gemini | Chave free tier | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| 8.5 | OpenRouter | Chave | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| 8.6 | Ollama | Desktop + modelo local | ☐ | ☐ | ☐ | ☐ | ☐ | | |

\* Verificar em DevTools → Network que a API key **não aparece em URLs**, só em headers; e que nos logs (console) aparece `***REDACTED***`.

---

## 9. Cenários de concorrência e edge cases (todos os hosts quando aplicável)

| # | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|
| 9.1 | Trocar de separador (Chat → History → Settings) durante geração → pedido continua, Parar funciona | ☐ | | |
| 9.2 | Parar + iniciar novo chat rapidamente durante streaming → sem duplicação de mensagens | ☐ | | |
| 9.3 | Dois templates clicados rapidamente → segundo bloqueado ou enfileirado, não duplica | ☐ | | |
| 9.4 | Cofre: bloquear durante ação → ação cancelada; desbloquear → nova ação funciona | ☐ | | |
| 9.5 | Eliminar conversa ativa durante save pendente → sem corruption do histórico | ☐ | | |
| 9.6 | Limpar histórico (Clear all) durante save pendente → clear acontece após save, sem repor dados | ☐ | | |
| 9.7 | Recarregar o taskpane (refresh) durante streaming → estado consistente | ☐ | | |
| 9.8 | Fechar e reabrir o documento → histórico do add-in persiste (IndexedDB) | ☐ | | |
| 9.9 | Resposta truncada (max_tokens/length) → parcial marcada incompleta, aviso no chat, sem write Office | ☐ | | |
| 9.10 | Stream cai a meio (rede) → parcial guardada, erro amigável | ☐ | | |

---

## 10. Segurança e privacidade

| # | Cenário | Resultado | Evidência | Notas |
|---|---|---|---|---|
| 10.1 | API keys guardadas cifradas (AES-GCM) — inspecionar Storage no DevTools: não há texto plano | ☐ | | |
| 10.2 | Com passphrase ativada, dados no storage são `enc:v2` (cifrados) | ☐ | | |
| 10.3 | API keys nunca aparecem em URLs de rede (DevTools → Network) | ☐ | | |
| 10.4 | Logs da consola masked (`***REDACTED***`) | ☐ | | |
| 10.5 | Proxy Worker rejeita pedidos de origins não autorizadas (testar com origin errada → 403) | ☐ | | |
| 10.6 | Proxy em produção sem ALLOWED_ORIGINS → fail-fast (recusa todos os pedidos) | ☐ | | |

---

## 11. Resumo e sign-off

| Métrica | Valor |
|---|---|
| Total de testes planeados | _______ |
| Passaram (✅) | _______ |
| Falharam (❌) | _______ |
| Não aplicáveis (⏭️) | _______ |
| Hosts/plataformas cobertos | _______ |
| Fornecedores testados com sucesso | _______ |
| Data de início | _______ |
| Data de conclusão | _______ |
| Testador | _______ |
| Commit testado | _______ |
| Versão do Office | _______ |
| SO | _______ |

**Decisão final**: ☐ Pronto para uso / ☐ Pronto com ressalvas (listar) / ☐ Não pronto (listar bloqueadores)

**Ressalvas / bloqueadores**:

```

```

---

## Como usar este checklist

1. Preencher a secção 0 (ambiente) antes de começar.
2. Para cada teste, executar o cenário, marcar o resultado e guardar evidência (screenshot em `testing-evidence/` ou descrição).
3. Se um teste falhar, criar uma issue no GitHub com: ID do teste, cenário, resultado esperado vs. obtido, screenshot/log, versão do Office e commit.
4. Atualizar o `VALIDATION_REPORT.md` com os resultados finais após concluir todos os testes.
