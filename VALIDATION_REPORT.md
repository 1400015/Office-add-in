# Registo de validação

Data: 31 de outubro de 2026. Base: `5b16013d7d10a74ebbeb803db83f03afe03862fe`. As alterações estão no workspace local.

**Revisão posterior:** após as verificações registadas abaixo, foram alterados o arranque do Office, a leitura de credenciais, o envio do chat e os cabeçalhos CORS do proxy. A pedido do utilizador, essas alterações ainda não foram testadas. Os resultados abaixo pertencem ao estado anterior a esta revisão.

Nesta revisão foram preparados os seguintes ajustes para validação posterior:

- Aguardar `Office.onReady` antes de identificar o programa anfitrião e apresentar uma opção de recarregar se as definições não puderem ser lidas.
- Propagar erros de leitura, decifra e interpretação das configurações protegidas para evitar substituí-las por valores vazios.
- Manter o texto introduzido se o envio não for aceite, e manter o chat ocupado enquanto a resposta termina de ser guardada.
- Não assinalar um template como enviado se o pedido não tiver sido aceite.
- Tratar falhas ao guardar uma resposta cujo alvo Office sofreu um conflito e impedir erros tardios de aparecer noutra conversa.
- Permitir explicitamente `Authorization` e os cabeçalhos dos fornecedores no preflight CORS do proxy.

## Verificações automáticas

| Verificação | Resultado | Contexto |
| --- | --- | --- |
| Instalação limpa | Aprovado | `npm ci --no-audit --no-fund`, com o lockfile atualizado |
| TypeScript | Aprovado | `npm run typecheck` |
| ESLint | Aprovado | `npm run lint`, incluindo após gerar o bundle do proxy |
| Formatação | Aprovado | `npm run format:check` |
| Testes automatizados | Aprovado | `npm test`: 277 testes, 29 ficheiros |
| Build de produção | Aprovado | `npm run build`; Node 24.19.0 |
| Manifesto | Aprovado | `npm run validate`: serviço Microsoft respondeu `Accepted` |
| Informação do manifesto | Aprovado | `npx office-addin-manifest info manifest.xml` |
| Bundle do Worker | Aprovado | `npx --yes wrangler@4 deploy --dry-run --outdir dist-proxy`; sem deploy |
| Dependências de produção | Aprovado | `npm audit --omit=dev`: zero vulnerabilidades reportadas |
| Espaços e conflitos no diff | Aprovado | `git diff --check` |

Os testes automatizados usam mocks para Office, respostas dos fornecedores, armazenamento e condições de concorrência. Incluem testes de protocolo SSE e NDJSON, cancelamento, conflitos nos documentos, proteção do cofre, preferências, friso e validador. O manifesto foi submetido ao serviço oficial através do proxy do ambiente. O dry-run de Wrangler informou a existência de múltiplos ambientes, mas terminou com código zero e sem publicação.

## Ensaios Office pendentes

Não existem aplicações Microsoft Office nem sessões dos fornecedores configuradas neste ambiente. Não foi feito sideload e nenhuma das combinações abaixo foi executada. A aprovação do manifesto e os mocks não verificam o comportamento real do Office.

| Host | Windows Desktop | macOS Desktop | Office na Web |
| --- | --- | --- | --- |
| Word | Pendente | Pendente | Pendente |
| Excel | Pendente | Pendente | Pendente |
| PowerPoint | Pendente | Pendente | Pendente |

Em cada combinação disponível, usar um documento de teste e seguir `INSTALL.md` para iniciar o servidor HTTPS e carregar o manifesto. Confirmar carregamento, friso, chat e ações específicas. Registar a versão do Office, o sistema e o resultado de cada caso:

- Word: alterar seleção durante o pedido; alterar/eliminar o alvo; tentar substituir seleção com 60 001 caracteres; gerar conteúdo e verificar o destino original.
- Excel: mudar célula/folha durante geração de fórmula; editar a célula ou permitir recálculo; analisar seleção de coluna/folha inteira e verificar o limite; testar inserção manual.
- PowerPoint: melhorar/traduzir/corrigir texto, editar/eliminar shape durante a resposta, criar slides e cancelar durante a criação.
- Em todos os hosts: executar comando do friso com painel aberto e fechado; trocar separador, parar e iniciar novo chat durante geração; confirmar ausência de duplicação.
- Cofre: ativar, bloquear, recarregar e desbloquear; bloquear durante uma ação; inspecionar em dados de teste se histórico protegido está cifrado; eliminar/limpar durante gravações pendentes.

## Fornecedores pendentes

Não foram usadas credenciais reais nem efetuadas chamadas reais aos fornecedores. Antes de considerar as integrações validadas, configurar endpoints/chaves de teste e confirmar probe, catálogo, resposta de ação e streaming para cada um:

| Fornecedor | Resultado real | Condições |
| --- | --- | --- |
| Mistral | Pendente | Chave e endpoint de teste |
| OpenAI | Pendente | Chave e proxy HTTPS configurado |
| Claude | Pendente | Chave e proxy HTTPS configurado |
| Gemini | Pendente | Chave e endpoint de teste |
| OpenRouter | Pendente | Chave e endpoint de teste |
| Ollama | Pendente | Office Desktop, servidor local e modelo instalado |

Os pedidos reais de geração podem consumir quota. O botão de teste de ligação usa pedidos sem geração. Confirmar igualmente que chaves não aparecem em URLs, logs ou mensagens de erro, e que os headers chegam ao fornecedor através do proxy.

## Estado de entrega

As verificações automáticas aprovadas cobrem o estado local analisado. A validação em Word, Excel, PowerPoint e nos fornecedores reais permanece pendente até existirem ambientes e credenciais de teste. Marcar cada combinação como aprovada ou falhada apenas depois de a executar, com versão e evidência correspondente.
