# Plano de execução para o 6.1 Sol — correções C1–C6

Data: 2 de novembro de 2026. Estado: **C1–C6 implementadas e verificadas estaticamente; testes adiados pelo utilizador e ensaios reais pendentes**.

## 1. Objetivo e base de trabalho

Implementar integralmente as seis correções identificadas na revisão posterior às alterações R1–R7. Este documento fixa o comportamento pretendido, a sequência de trabalho, os critérios de aceitação e a forma de registar a validação.

Repositório: `/workspace/Office-add-in` (`1400015/Office-add-in`). No momento da elaboração, a branch é `main` e o último commit é `af5a14e3e0b6d06c2bfdfe4509a20cc3810f6f8e`. **A base efetiva inclui alterações locais ainda sem commit e ficheiros novos ainda não rastreados.** As correções R1–R7 estão nesse trabalho local; começar apenas pelo commit remoto perderia parte da base necessária.

O histórico E1–E9 continua em [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Os resultados anteriores continuam em [VALIDATION_REPORT.md](VALIDATION_REPORT.md). Não voltar a executar esses planos desde o início nem apresentar resultados históricos como validação destas seis correções.

### Instruções de execução

1. Ler os `AGENTS.md` aplicáveis, este documento, os dois documentos anteriores e `package.json`. Inspecionar `git status --short`, `git diff --stat` e os diffs dos ficheiros a alterar. Preservar alterações e ficheiros novos existentes.
2. Trabalhar sobre o estado local atual. Se criar uma branch, fazê-lo sem descartar esse estado. Não usar `reset --hard`, `clean`, restauros em massa ou um checkout limpo como substituição da base.
3. Implementar todas as etapas C1–C6, incluindo integração, mensagens nos cinco idiomas e documentação necessária. Resolver escolhas internas compatíveis com este plano sem interromper o trabalho para confirmação.
4. **Manter os testes adiados por indicação do utilizador. Nesta execução, não acrescentar, alterar ou executar testes.** Os cenários abaixo são requisitos para futura validação; não significam que foram executados.
5. Executar as verificações estáticas da secção 7. Não são testes funcionais e não comprovam comportamento no Office.
6. Conservar React, Zustand, TypeScript, os seis fornecedores, os três hosts e os formatos de armazenamento. Não acrescentar dependências nem alterar o manifesto para resolver estas correções.
7. Este plano termina com alterações locais revistas e o relatório atualizado. Chamadas reais de geração, mutações em documentos Office, publicação e operações Git de entrega seguem um pedido específico aplicável; não fazem parte desta execução do plano.

## 2. Correções, prioridades e ordem

Os identificadores correspondem à lista da revisão, não à ordem de implementação.

| ID | Prioridade | Correção | Dependência |
| --- | --- | --- | --- |
| C1 | P1 | Identificar por ID os slides criados antes de escrever ou apagar placeholders | Nenhuma; fornece helper a C6 |
| C2 | P1 | Manter a fila de definições ocupada até todas as gravações terminarem, mesmo com falha parcial | Nenhuma |
| C3 | P2 | Normalizar conteúdo Mistral em texto, em respostas normais e em streaming | Nenhuma |
| C4 | P2 | Controlar catálogo e modelo utilizável independentemente do separador Chat | Integrar após C2 e C5 |
| C5 | P2 | Impedir gravações/publicações do histórico pertencentes a uma sessão anterior do cofre | Preservar a ordenação existente do histórico |
| C6 | P2 | Fixar o destino da inserção manual PowerPoint antes dos awaits | C1 para apresentações vazias |

**Ordem recomendada: C2 → C5 → C1 → C6 → C3 → C4 → integração e documentação.**

Se houver delegação, Office (C1/C6) e fornecedores (C3) podem avançar em paralelo com persistência (C2/C5). Atribuir um único responsável a `useAppStore.ts`; integrar C4 depois das alterações de persistência. `useChat.ts`, tipos, `ErrorService.ts` e traduções também precisam de um responsável de integração para evitar edições concorrentes.

### Comportamentos a preservar em todas as etapas

- Uma operação de conteúdo por runtime, coordenada por `OperationService`; a propriedade da operação é verificada antes das escritas e depois dos awaits relevantes.
- Parar conserva uma única resposta parcial; Novo chat, carregar outra conversa e bloquear o cofre invalidam operações antigas. Respostas incompletas não são aplicadas automaticamente a documentos.
- Cofre bloqueado impede geração e gravações protegidas, incluindo com Ollama. O desbloqueio só liberta operações depois da proteção das configurações e da migração do histórico.
- Eliminar/limpar histórico só remove registos da interface depois da confirmação do armazenamento. Falhas conservam os registos e apresentam erro.
- Modelos incompatíveis ficam excluídos. Modelos desconhecidos exigem escolha explícita ou preferência anteriormente guardada. O probe continua separado da seleção e não gera conteúdo.
- Uma operação aceite conserva a configuração, o modelo e as opções capturados no início. Trocar de separador ou editar configurações não redireciona esse pedido para outro endpoint.
- Os formatos existentes de conversa, `incomplete`, `enc:v1`/`enc:v2` e preferências por fornecedor continuam legíveis.

## 3. Persistência

### C2 — Barreira completa nas gravações de definições

**Problema:** `persist()` lança várias gravações em paralelo e usa `Promise.all`. A primeira rejeição termina esse trabalho na `settingsQueue`, embora outras gravações continuem pendentes. Uma gravação antiga pode acabar depois da gravação seguinte e repor configurações antigas, inclusive após a migração para proteção com frase-passe.

**Ficheiros:** `src/store/useAppStore.ts`; rever os contratos em `StorageService.ts`, `CryptoService.ts` e `ModelService.ts`. Ajustar consumidores de `persist()` apenas se necessário para preservar a apresentação de erros.

**Implementação:**

1. Manter a fila única de definições e a sua capacidade de continuar depois de uma falha. O trabalho de uma entrada só pode terminar quando todas as gravações que iniciou tiverem terminado.
2. Substituir a espera que rejeita cedo por uma barreira equivalente a `Promise.allSettled`. Depois da barreira, inspecionar todos os resultados e propagar a primeira falha na ordem das operações. Não transformar uma falha parcial em sucesso.
3. Garantir que uma exceção síncrona ao iniciar uma gravação não deixa gravações anteriores fora da barreira. Uma solução pequena é criar funções de trabalho e executá-las com `Promise.resolve().then(work)` antes de `allSettled`.
4. Só executar uma eventual gravação subsequente da preferência de modelo quando a barreira tiver terminado com sucesso. Na integração C4, retirar de `persist()` a gravação incondicional de `activeModel`; o valor temporário vazio durante uma consulta nunca pode apagar uma preferência válida.
5. Conservar o erro para o chamador. A recuperação da cauda da fila existe para permitir o próximo trabalho, sem apresentar a operação falhada como guardada na interface.
6. Rever `createPassphrase()` e `unlockSecrets()`: a regravação protegida das configurações deve ficar depois de todas as escritas anteriores, incluindo as restantes de um lote parcialmente falhado.
7. Manter as guardas criptográficas atuais antes do envio de gravações protegidas. A barreira resolve ordenação; não cancela escritas que já foram enviadas ao armazenamento.

**Evitar:** um retry que espere pela própria `settingsQueue`; chamar `persist()` dentro de um trabalho dessa mesma fila; libertar a fila por timeout deixando gravações ativas; uma dependência circular entre `settingsQueue`, `historyQueue` e `ModelService.modelWrites`.

**Critérios de aceitação / cenários para testes posteriores:**

- Lote A: uma gravação falha imediatamente e outra fica suspensa. Lote B é pedido. B não inicia enquanto a gravação suspensa de A não terminar; o erro de A só é devolvido após essa conclusão.
- Depois de A terminar, B pode guardar e o estado final corresponde a B. A interface não mostrou sucesso para A.
- Uma ativação/desbloqueio de frase-passe enfileirada depois de A conclui a proteção das configurações sem uma escrita antiga aparecer depois.
- A primeira operação falhada não bloqueia permanentemente a fila e nenhum erro fica sem tratamento.

### C5 — Associar gravação e publicação do histórico à sessão do cofre

**Problema:** `saveConversation()` captura a época do histórico e a revisão da conversa, mas não `vaultEpoch`. Um trabalho iniciado antes de bloquear pode continuar depois de bloquear/desbloquear, gravar um snapshot antigo ou publicar uma lista materializada na sessão anterior.

**Ficheiros:** `src/store/useAppStore.ts`; rever `src/services/HistoryService.ts`, `CryptoService.ts` e os consumidores em `src/hooks/useChat.ts`.

**Implementação:**

1. Capturar `vaultEpoch` e a revisão de `CryptoService` quando `saveConversation()` é chamado, juntamente com `historyEpoch`, ID/revisão da conversa e o snapshot de mensagens.
2. Definir uma guarda pequena de validade que combine os contadores relevantes e o estado do cofre. Não exigir `CryptoService.isUnlocked()` indiscriminadamente quando ainda não existe frase-passe; conservar o funcionamento sem cofre protegido.
3. Validar dentro da fila imediatamente antes de chamar `HistoryService.saveChat`. Uma operação que aguardou na fila e pertence a uma sessão anterior termina sem iniciar uma gravação nova, mesmo que o cofre esteja novamente desbloqueado.
4. Retirar o incremento antecipado de `historyVersion` na entrada atual de `saveConversation()` e incrementá-lo após `saveChat` confirmado, para invalidar leituras anteriores. Registar se esse trabalho efetivamente gravou; um trabalho descartado não consulta nem publica a lista. Uma mutação confirmada continua a existir, ainda que a sessão tenha mudado durante o await. Preservar as invalidações próprias de delete/clear.
5. Só consultar/publicar a lista se a operação ainda pertencer à sessão válida. Revalidar antes de `listChats()` e depois do seu await, incluindo a versão do histórico e a revisão da conversa. Uma leitura antiga nunca substitui a lista carregada pelo novo desbloqueio.
6. Distinguir descarte por sessão expirada de falha real de armazenamento. Resultados e erros de trabalhos expirados não podem alterar a interface de uma nova sessão; falhas de uma sessão ainda válida continuam a ser reportadas.
7. Preservar os guardas de `hydrate()`, `unlockSecrets()`, eliminação e limpeza. **Não aplicar indiscriminadamente a guarda da sessão às eliminações confirmadas:** uma eliminação que já chegou ao armazenamento deve continuar a remover esse ID da lista atual e a invalidar leituras antigas.
8. Não tentar desfazer uma gravação que já foi confirmada. Se ela precedeu o bloqueio, a sessão seguinte pode legitimamente carregá-la de novo através do fluxo atual de hidratação.

**Critérios de aceitação / cenários para testes posteriores:**

- Suspender `listChats()` de uma gravação A, bloquear/desbloquear, carregar a lista B e só depois concluir A: B permanece na interface.
- Enfileirar uma gravação na sessão A, bloquear/desbloquear antes de ela entrar no serviço: esse snapshot não é gravado na sessão B.
- Uma lista com materializações `locked` da sessão antiga não substitui a lista decifrada da sessão nova.
- Uma gravação confirmada antes do bloqueio não é apagada artificialmente. Eliminar/limpar continua sem recuperar registos por leituras atrasadas.
- Um erro tardio da sessão antiga não substitui o estado/erro da sessão nova; um erro atual continua visível.

## 4. PowerPoint

### C1 — Identificar o slide criado por ID

**Problema:** `createPresentation()` chama `slides.add()`, consulta a contagem, aguarda e usa `getItemAt(count - 1)` num lote posterior. Uma reordenação pode fazer esse índice apontar para um slide existente, cujos placeholders são então apagados.

**Ficheiros:** `src/powerpoint/powerpointActions.ts`; criar, se necessário, `src/powerpoint/slideTargets.ts` para partilhar a criação segura com C6. Reutilizar `ActionConflictError` e `ActionContext`.

**Contrato real a respeitar:** `PowerPoint.SlideCollection.add()` devolve `void`. `AddSlideOptions` aceita `layoutId` e `slideMasterId`, sem permitir atribuir um ID escolhido pelo cliente. Não usar o retorno de `add()` como slide nem inventar um token de criação na API. Confirmar os tipos instalados de Office.js antes de escrever o helper.

**Implementação:**

1. Preparar a representação textual completa do plano gerado antes de começar a alterar o documento, para a conservar no chat em caso de conflito.
2. Dentro do mesmo `PowerPoint.run`, carregar os IDs dos slides existentes e guardar uma cópia imutável desse conjunto.
3. Validar a operação; enfileirar `slides.add()` e uma nova carga de `items/id` antes do mesmo `context.sync()`. Não separar a adição e a consulta dos IDs por um lote extra que só obtenha uma contagem.
4. Após o sync, verificar que todos os IDs anteriores continuam presentes e que existe exatamente um ID novo. Uma mera reordenação é admissível. Zero IDs novos, vários IDs novos ou desaparecimento de IDs anteriores tornam a identificação ambígua.
5. Em caso ambíguo, interromper com conflito antes de apagar placeholders ou escrever conteúdo. Conservar o plano no chat através de `ActionConflictError(result)`. Não tentar eliminar slides para fazer rollback quando a propriedade é incerta.
6. Uma vez identificado, usar exclusivamente `slides.getItem(newSlideId)` nas operações seguintes. Nunca resolver novamente pelo último índice ou pela seleção atual.
7. A limpeza de placeholders, se mantida, fica confinada a esse slide identificado. Carregar IDs/tipos necessários; não apagar shapes de qualquer slide do conjunto anterior. Se o destino desaparecer ou se houver sinais de edição concorrente incompatível, interromper e conservar o plano. Não usar um catch genérico para procurar outro slide.
8. Repetir a captura por cada slide a criar. Guardar progresso local suficiente para informar que a operação pode ter criado apenas parte da apresentação. Uma falha posterior não justifica apagar slides existentes ou repetir automaticamente toda a criação.
9. Aplicar `assertCurrent()` antes de enfileirar mutações, imediatamente antes dos syncs que as enviam e após os awaits relevantes. Converter erros de destino desaparecido em conflito; não converter cancelamento em sucesso.

**Limite a documentar:** a diferença de IDs e o agrupamento dos comandos reduzem a corrida e impedem o uso de índices atrasados. Office.js não disponibiliza aqui uma transação com identidade de criação atribuída pelo cliente. Não afirmar garantia atómica de propriedade perante qualquer combinação de edições simultâneas de coautores. A coautoria real permanece um ensaio obrigatório posterior.

**Critérios de aceitação / cenários para testes posteriores:**

- Reordenar slides entre a criação e a escrita: o conteúdo é aplicado ao ID novo; os slides anteriores e os seus placeholders conservam-se.
- Dois IDs novos ou um ID anterior desaparecido: conflito sem limpeza destrutiva; o plano fica disponível no chat.
- Eliminar o novo slide antes da escrita: conflito, sem escolher um slide alternativo.
- Cancelar depois de um slide já ter sido criado: não iniciar os seguintes; não prometer desfazer o que o Office já recebeu.
- Criar numa apresentação vazia e criar vários slides conserva a ordem pretendida quando não há edições concorrentes.

### C6 — Preservar o destino inicial da inserção manual

**Problema:** `insertTextOnSlide()` tenta primeiro o intervalo de texto selecionado. Se falhar, chama outro `PowerPoint.run` que consulta novamente o slide selecionado. Uma mudança de seleção entre esses awaits muda o destino da inserção; o catch atual também pode repetir uma escrita cujo resultado é incerto.

**Ficheiros:** `src/powerpoint/powerpointActions.ts`, helper introduzido em C1; rever o encaminhamento em `src/services/OfficeService.ts` e `src/hooks/useChat.ts` sem alterar as inserções Word/Excel desnecessariamente.

**Implementação:**

1. Reorganizar a inserção como uma captura inicial e uma aplicação ao destino capturado, preferencialmente no mesmo `PowerPoint.run`.
2. Na captura, obter os IDs dos slides selecionados, os IDs da coleção para a política sem seleção e, se a API for suportada, o intervalo de texto selecionado com o respetivo conteúdo. Enfileirar a captura antes do primeiro await relevante.
3. Usar a deteção de suporte a `getSelectedTextRangeOrNullObject`/PowerPointApi 1.5. Não assumir que verificar apenas a existência de uma função garante suporte no host. Não inventar `TextRange.track()` por analogia com Word; conservar o proxy no mesmo `run` ou usar apenas um mecanismo realmente suportado e com limpeza em `finally`.
4. Fixar a política de destino: primeiro slide da seleção inicial; sem slides selecionados, último ID da coleção inicial; coleção inicialmente vazia, criar um slide pelo helper C1. Essa política não volta a consultar a seleção depois de um await.
5. Quando existir um intervalo válido, conservar a semântica atual de acrescentar o texto com a quebra de linha necessária. Revalidar o conteúdo capturado antes de o substituir quando a API o permitir; uma alteração incompatível é conflito.
6. Quando não existir intervalo ou a API for reconhecidamente indisponível, adicionar a caixa de texto ao ID capturado. Se esse ID desaparecer, devolver conflito. Se a captura falhar antes de obter um ID estável, terminar com erro, sem recapturar a seleção para adivinhar o destino.
7. Restringir o fallback às condições conhecidas de ausência de intervalo/API. Falhas de leitura inesperadas, alvo eliminado, erro de escrita ou erro de sync com possível escrita já enviada não podem provocar uma segunda inserção automática.
8. Aplicar as guardas da operação em todos os limites assíncronos e antes das escritas. A resposta já existente no chat permanece disponível se a inserção não puder ser concluída.

**Critérios de aceitação / cenários para testes posteriores:**

- Clicar em inserir no slide A sem texto selecionado e selecionar B durante a leitura: a caixa é criada em A.
- Seleção de texto válida mantém o destino e a semântica de inserção; uma alteração concorrente detetável impede a substituição.
- API de seleção de texto indisponível usa o slide inicialmente capturado. Falha de captura sem destino identificável termina com erro.
- Eliminar A durante o pedido não insere em B. Falha após envio de escrita não cria uma caixa adicional.
- Sem seleção, usa o último ID inicial; sem slides, usa a criação C1. Cancelamento e dois cliques continuam sujeitos ao coordenador único.

## 5. Fornecedor Mistral

### C3 — Normalizar conteúdo antes de o usar

**Problema:** respostas e deltas Mistral podem conter uma string ou uma lista de blocos. O código assume string: arrays podem chegar ao chat como `[object Object]`, falhar nos tratamentos de texto Office ou quebrar a conservação de uma resposta incompleta.

**Ficheiros:** `src/providers/MistralProvider.ts`, `src/providers/BaseProvider.ts`; pequeno normalizador próprio se melhorar a clareza. Rever `src/services/responseCompletion.ts` e o contrato de `IncompleteResponseError`, sem enfraquecer a deteção de respostas truncadas.

**Referências de contrato:** modelos `assistantmessage.ts`, `deltamessage.ts` e `contentchunk.ts` no SDK oficial [mistralai/client-ts](https://github.com/mistralai/client-ts/tree/main/src/models/components). Não é necessário instalar o SDK.

**Implementação:**

1. Tratar o conteúdo recebido como `unknown` na fronteira externa. Implementar uma função pura equivalente a `normalizeMistralText(content: unknown): string`.
2. String: devolver sem alterações. `null`/`undefined`: devolver texto vazio, permitindo frames normais de role, usage e terminação que não tragam conteúdo.
3. Array: percorrer na ordem recebida e concatenar apenas blocos `{ type: "text", text: string }`. Preservar espaços e quebras de linha vindos do fornecedor; não inventar separadores.
4. Ignorar blocos não textuais identificados por um discriminador válido, incluindo thinking/raciocínio, imagem e referências. Não converter o conteúdo desses blocos para a resposta visível.
5. Rejeitar tipos brutos inválidos, blocos sem discriminador ou blocos textuais cujo `text` não seja string com um `ProviderError` de protocolo. Nunca recorrer a `String(object)`, JSON serializado ou coerção de arrays como resposta. Não incluir payloads completos/segredos no erro.
6. Aplicar a normalização antes de `assertResponseComplete` na resposta normal. `IncompleteResponseError.result` tem de continuar a ser sempre string; truncagem com texto útil conserva esse texto.
7. Acrescentar um ponto de extração protegido em `BaseProvider` para normalizar o conteúdo dos deltas, especializado em Mistral. Conservar o parser/transporte SSE comum e os contratos dos outros fornecedores; não copiar toda a implementação de streaming.
8. Só chamar `onToken` com strings não vazias e só marcar texto emitido nessa situação. Frames sem texto não são erros de protocolo. Um fluxo final sem qualquer texto continua a dar erro de resposta vazia.
9. Conservar verificações de `finish_reason`, marcador terminal, timeout e cancelamento. Não acrescentar retry automático de geração. Falha de protocolo após texto já emitido continua a preservar a parcial pelo fluxo existente do chat.

**Critérios de aceitação / cenários para testes posteriores:**

- Resposta simples e resposta com vários blocos textuais produzem exatamente o texto esperado.
- Blocos thinking intercalados com texto não aparecem no chat, no histórico nem no documento.
- Deltas de role/usage/terminal sem conteúdo são aceites; thinking sem texto final não produz resposta artificial.
- Array com `finish_reason: "length"` resulta numa parcial textual identificada e nenhuma escrita automática no Office.
- Bloco `text` malformado e conteúdo numérico/objeto inesperado dão erro controlado; nunca `[object Object]`.
- EOF sem terminal, cancelamento e falha após uma parcial mantêm a semântica atual. OpenAI/OpenRouter e os fornecedores que especializam streaming mantêm o comportamento anterior.

## 6. Disponibilidade global do modelo

### C4 — Retirar a reconciliação do ciclo de vida de ChatView

**Problema:** `ProviderSelectors` consulta modelos e reconcilia a seleção apenas enquanto está montado dentro de `ChatView`. Editar endpoint/chave em Definições e ir diretamente a Templates, ou acionar o friso nesse separador, pode usar o modelo antigo com a configuração nova. Limpar o modelo apenas num `useEffect` também deixa uma janela antes de o efeito executar.

**Ficheiros:** `src/store/useAppStore.ts`, `src/services/ModelService.ts`, `src/hooks/useChat.ts`, `src/taskpane/Taskpane.tsx`, `src/taskpane/components/ProviderSelectors.tsx`, `src/taskpane/TemplatesView.tsx`, `src/hooks/useRibbonCommands.ts`; criar `src/hooks/useModelCatalog.ts` ou um controlador equivalente. Integrar tipos, erros e traduções.

#### C4.1 — Estado e invalidadores síncronos

1. Introduzir estado partilhado mínimo para o catálogo atual: `status` (`idle`, `loading`, `ready`, `error`), fornecedor, revisão de configuração, ID da consulta, modelos, origem/aviso e erro. A lista vazia pode ser `ready`, mas não torna um modelo utilizável.
2. Manter revisões monotónicas por fornecedor e uma geração para pedidos/refresh. Comparar apenas o nome do fornecedor ou voltar a encontrar A depois de A → B → A não é suficiente.
3. Distinguir a preferência desejada/guardada do modelo efetivamente utilizável. Pode manter `activeModel: string` com `""` enquanto indisponível, desde que a preferência fique separada e nunca seja apagada por esse estado transitório.
4. Invalidar a prontidão **sincronamente** em `setActiveProvider`, na alteração efetiva de configurações relevantes do fornecedor ativo, em refresh e nas transições de hidratação/cofre. Incrementar revisões e limpar o modelo efetivo antes de devolver controlo ao chamador; não esperar pelo efeito React.
5. Configuração relevante inclui endpoint, chave, proxy, uso de proxy e timeout, em coerência com `ModelService.sameConfig`. Alterar outro fornecedor invalida a revisão/cache desse fornecedor, sem interromper desnecessariamente o catálogo ativo.
6. Hidratar uma preferência não a torna imediatamente utilizável: primeiro reconciliar com o catálogo da configuração atual. Bloquear limpa o estado do catálogo e invalida respostas pendentes, sem expor segredos nesse estado.

#### C4.2 — Coordenador sempre montado

1. Montar `useModelCatalog()` uma única vez em `Taskpane`, fora da renderização condicional dos separadores. Se for usado um controlador de serviço, assegurar a mesma duração e limpeza.
2. O coordenador observa prontidão Office, hidratação, bloqueio, fornecedor, revisão e refresh. Só consulta quando as condições o permitem. Reconciliar também ao abrir diretamente `?view=settings` e ao desbloquear enquanto Definições está ativo.
3. Usar `AbortController` fora do estado serializado. Cancelar a consulta substituída e verificar identidade/revisões antes de publicar qualquer resultado, erro, warning ou estado de carregamento. Uma conclusão antiga não termina o loading de uma nova consulta.
4. Capturar também a geração relevante do cofre. Verificar os guardas depois de ler a preferência guardada, depois do catálogo e antes de gravar uma nova preferência.
5. O cleanup deve tolerar montagem/limpeza repetida em React StrictMode sem duplicar publicações nem deixar a seleção permanentemente indisponível.
6. Para edição contínua de endpoint/chave, admitir um debounce curto, aproximadamente 300 ms. A invalidação é sempre imediata; a consulta é que pode esperar. Hidratação, troca explícita de fornecedor e refresh não precisam desse atraso.
7. Manter o fluxo de dependências num só sentido: hook/controlador usa store e serviços; `ModelService` não importa o store para tentar geri-lo. Evitar duas fontes de estado e importações circulares.

#### C4.3 — Seleção e persistência

1. Reutilizar a classificação e `defaultChatModel`. Primeiro procurar a preferência válida do mesmo fornecedor na lista resultante; depois escolher o default suportado. Não transportar o modelo efetivo de outro fornecedor como preferência implícita.
2. Uma preferência desconhecida já guardada ou uma escolha explícita de modelo desconhecido pode ser usada se esse ID estiver na lista admissível, com o aviso existente. Uma lista só de desconhecidos, sem preferência, exige seleção explícita. Incompatíveis nunca são escolhidos.
3. Lista vazia/sem candidato deixa o modelo efetivo vazio. Sugestões cloud em fallback continuam identificadas como sugestões; não transformar um Ollama vazio em modelos fictícios. Prontidão do catálogo não significa inferência, quota ou permissões validadas.
4. Simplificar `ProviderSelectors` para consumir o estado partilhado e emitir escolhas/refresh. Retirar o loader e a reconciliação locais; trocar de separador não volta a iniciar todo o processo.
5. Validar escolhas de modelo contra a lista e a revisão atuais no método do store/controlador, além da UI. Uma escolha ou callback de um catálogo antigo é descartado.
6. Remover a chamada automática a `persist()` completo no carregamento do catálogo. O coordenador não deve guardar credenciais a cada edição de Definições. Guardar fornecedor/preferência com métodos estreitos; conservar o comportamento explícito de Guardar das definições. A gravação estreita de `activeProvider` usa a mesma `settingsQueue` de `persist()`, com guarda de validade antes de escrever, para não criar escritores concorrentes da mesma chave. A preferência do modelo fica exclusivamente em `modelWrites`.
7. Retirar de `persist()` a escrita incondicional do modelo transitório vazio. A gravação da preferência validada fica num percurso único, serializado por `ModelService.modelWrites`.
8. Proteger `setStoredActiveModel` com identidade/revisão da seleção, por exemplo através de um predicado de validade passado pelo chamador. Verificar ao entrar na fila, depois de ler o mapa existente e imediatamente antes de escrever. Incluir a revisão da escolha explícita para um resultado de catálogo não substituir uma escolha mais recente.
9. Não chamar `getStoredActiveModel()` de dentro do próprio trabalho de `modelWrites`, porque esse método espera pela fila. Conservar o read-modify-write serializado e garantir que uma falha não bloqueia gravações seguintes. Uma escrita já enviada não é revogável; uma preferência atual posterior deve ficar ordenada depois dela.
10. Não condicionar a UI de sucesso a uma gravação antiga que já perdeu validade. Falhas atuais na persistência continuam a ser apresentadas.

#### C4.4 — Guardas em todos os pontos de entrada

1. Acrescentar ao guarda central `configured()`/equivalente: catálogo pronto, identidade/revisão correspondentes à configuração ativa e modelo escolhido presente no catálogo admissível. Continuar a validar hidratação, cofre e chave quando exigida.
2. Aplicar esse guarda a envio, regeneração, templates, ações rápidas e comandos do friso antes de reservar/iniciar a operação. Desativar botões ajuda, mas o guarda central é obrigatório.
3. Uma tentativa sem modelo pronto apresenta uma razão traduzida e não inicia geração, não muda o prompt do template, não marca o template como enviado e não fica enfileirada para disparar automaticamente quando o catálogo chegar.
4. Tornar erros/indisponibilidade visíveis também em Templates e Definições quando a ação vier do friso. Usar uma área partilhada ou uma apresentação explícita por vista; não deixar o erro apenas no Chat desmontado nem mostrar banners duplicados.
5. Conservar a captura imutável de configuração e opções no início das operações aceites. A reconciliação afeta pedidos novos; um pedido já aceite conserva o destino original. Bloquear/Novo chat mantém o cancelamento atual.
6. Inserir manualmente uma resposta já existente continua a depender das guardas Office/cofre/operação, sem passar a exigir uma API configurada ou um catálogo pronto.

**Critérios de aceitação / cenários para testes posteriores:**

- Em Definições, mudar endpoint A para B e usar diretamente um template: durante a consulta, rejeição visível; depois, apenas um modelo válido para B pode ser usado.
- Invocar o friso sem nunca montar Chat: o mesmo guarda de prontidão é aplicado. Abrir com `?view=settings` permite reconciliar sem visitar Chat.
- Trocar A → B → A e concluir as consultas fora de ordem: só a identidade atual publica modelos, warnings e preferência. Refresh antigo não termina o loading atual.
- Carregar, bloquear e desbloquear com consulta pendente: a sessão anterior não repõe modelos nem preferências.
- Uma lista só de desconhecidos exige escolha; uma preferência admissível previamente guardada conserva-se. Lista vazia não permite geração.
- Guardar outras definições durante loading não grava `""` como preferência. Editar uma chave não provoca uma gravação automática completa pelo coordenador.
- Alterar configuração durante um stream aceite mantém endpoint/modelo desse stream; um pedido novo espera pela reconciliação.
- Rejeitar um template não altera o system prompt nem o estado “enviado”. Inserção de resposta existente continua possível com catálogo indisponível se as restantes condições forem válidas.

## 7. Integração e validação desta execução

### 7.1 Revisão de integração obrigatória

- Procurar todos os consumidores de `persist`, `setActiveModel`, `setActiveProvider`, `setStoredActiveModel`, `saveConversation`, `insertTextOnSlide` e `createPresentation`; confirmar que respeitam os contratos novos.
- Confirmar que nenhum percurso mantém a reconciliação exclusivamente em `ProviderSelectors` ou persiste o modelo vazio transitório.
- Confirmar que as duas filas de armazenamento conservam ordenação sem dependência circular; `modelWrites` nunca espera por si própria.
- Confirmar que os caminhos PowerPoint alterados não usam índices atrasados nem voltam a consultar a seleção como destino de fallback.
- Verificar estaticamente retenção de texto em conflitos/parciais, cancelamento, visibilidade de erros nos separadores e ausência de novos logs com conteúdo sensível.
- Reutilizar mensagens existentes quando forem adequadas. Acrescentar as restantes em `src/i18n/locales/{pt,en,es,fr,de}.json`, com o mesmo conjunto de chaves. Os textos devem explicar a ação ao utilizador, sem expor contadores/revisões internos.

### 7.2 Verificações estáticas autorizadas

Executar após integrar e corrigir os problemas encontrados:

```bash
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Usar Node compatível com `package.json` e as dependências locais. Se faltarem dependências, instalar com o lockfile existente, sem atualizações de versões. Formatar apenas os ficheiros alterados para estas correções; evitar alterações cosméticas em massa.

Registar comando, resultado, momento e limitações. Uma falha preexistente deve ser descrita com evidência; não a esconder como aprovação. `format:check` verifica o conjunto configurado em `package.json`, não a correção funcional do código. A revisão deste plano não exige build, auditoria de dependências ou validação remota do manifesto; se não forem executados, não reportar aprovação atual desses passos.

### 7.3 Testes automatizados adiados pelo utilizador

Os testes não foram acrescentados, adaptados nem executados localmente nesta execução, conforme a indicação do utilizador. O CI de GitHub executou-os automaticamente após o push solicitado e falhou porque os mocks/fixtures não seguem ainda os contratos atualizados descritos abaixo; esse resultado não é aprovação dos cenários funcionais C1–C6. Ao retomar a validação, adaptar os testes com promises controladas e mocks que respeitem as APIs reais. Mapa inicial para essa fase:

| Correção | Ficheiros de teste existentes a rever posteriormente | Cobertura principal |
| --- | --- | --- |
| C1/C6 | `tests/powerpointActions.test.ts`, `tests/officeService.test.ts`, `tests/operationConcurrency.test.tsx` | IDs, reordenação, fallback, alvo eliminado, cancelamento, escrita incerta |
| C2 | `tests/settings.test.ts`, `tests/storageService.test.ts`, `tests/vault.test.ts`, `tests/settingsView.test.tsx` | Rejeição precoce, barreira, ordenação e migração |
| C3 | `tests/providers.test.ts`, `tests/chatStream.test.ts`, `tests/useChat.test.tsx` | Strings/blocos, frames sem conteúdo, truncagem e retenção |
| C4 | `tests/providerSelectors.test.tsx`, `tests/useChat.test.tsx`, `tests/ribbon.test.ts`, `tests/operationConcurrency.test.tsx` | Todos os separadores, revisões, preferências, entradas e StrictMode |
| C5 | `tests/storeHistoryConcurrency.test.ts`, `tests/vault.test.ts`, `tests/historyService.test.ts` | Bloquear/desbloquear, snapshots e publicações atrasadas, delete/clear |
| Integração | `tests/i18n.test.ts` e suite completa, após adaptação dos contratos | Chaves e regressões entre áreas |

Na fase futura, adaptar igualmente os mocks que ficaram pendentes de R1–R7: Gemini com `finishReason`, shapes PowerPoint com tipo e `load()`, modelos automaticamente escolhidos com compatibilidade suportada. `slides.add()` deve continuar a devolver `void` nos mocks. Não enfraquecer o código de produção para acomodar um mock incorreto.

### 7.4 Verificações dependentes de ambiente real

Manter separadas da suspensão dos testes automatizados por opção do utilizador:

- PowerPoint Desktop e Web: criação, seleção de texto suportada/indisponível, mudança de slide, reordenação e coautoria, apresentação vazia, cancelamento e falhas de destino. Registar host, versão e documento de teste.
- Office/OfficeRuntime: persistência de definições, ciclo de frase-passe e histórico em IndexedDB, incluindo recarregar o add-in.
- Mistral: respostas reais simples/em blocos e streaming, com conta/modelo adequados. Não declarar validado um formato apenas porque os tipos foram corrigidos.
- Catálogos: trocar entre endpoints/contas controlados, incluindo Ollama com modelos instalados e sem modelos. Confirmar o friso e Templates em vários separadores.
- Regressão das ações em Word/Excel e dos restantes fornecedores quando existirem documentos, credenciais e autorização para os ensaios.

Registar como **pendente por falta de ambiente/credenciais**, quando essa for a causa. Não usar essa expressão para testes locais que foram apenas adiados pelo utilizador. Não afirmar que a ausência atual de testes impede concluir a implementação local.

## 8. Entrega, progresso e registo

### Quadro de progresso — atualizar durante a execução

“Implementado” significa código integrado e revisto. “Verificado estaticamente” exige comandos executados sobre esse estado. Nenhum dos dois significa “testado funcionalmente”.

| Etapa | Implementação | Verificações estáticas | Testes automatizados | Ambiente real |
| --- | --- | --- | --- | --- |
| C1 — Criação PowerPoint | Implementado | Aprovadas | Adiados pelo utilizador | Pendente |
| C2 — Fila de definições | Implementado | Aprovadas | Adiados pelo utilizador | Pendente |
| C3 — Conteúdo Mistral | Implementado | Aprovadas | Adiados pelo utilizador | Pendente |
| C4 — Modelo global | Implementado | Aprovadas | Adiados pelo utilizador | Pendente |
| C5 — Sessão do histórico | Implementado | Aprovadas | Adiados pelo utilizador | Pendente |
| C6 — Inserção PowerPoint | Implementado | Aprovadas | Adiados pelo utilizador | Pendente |
| Integração/documentação | Implementado | Aprovadas | Adiados pelo utilizador | Conforme cenários |

Para cada etapa, acrescentar aqui uma nota breve com ficheiros alterados, decisão tomada e eventual desvio justificado. Não marcar etapas como concluídas apenas por escrever o plano.

### Notas da execução — 2 de novembro de 2026

- **C2:** `useAppStore.ts` mantém todas as gravações iniciadas dentro de uma barreira `allSettled`, incluindo exceções síncronas transformadas em rejeições. Falhas propagam-se depois da barreira. `persist()` deixou de guardar o modelo efetivo; as preferências têm um único percurso em `modelWrites`.
- **C5:** `saveConversation()` captura a época do cofre e a revisão criptográfica, descarta snapshots expirados dentro da fila antes de gravar e verifica novamente antes/depois da lista. Só gravações confirmadas incrementam a versão. Falhas de sessões expiradas não publicam erros na sessão nova; delete/clear conservam as invalidações e a remoção após commit.
- **C1:** novo `powerpoint/slideTargets.ts` identifica a diferença entre IDs no batch de criação e recusa ambiguidades. `powerpointActions.ts` escreve por ID e conserva o plano completo em conflito. Foi escolhida a opção permitida de **conservar placeholders**, evitando limpeza destrutiva. `PresentationCreationConflictError` assinala criação possivelmente parcial, incluindo falhas depois de enviar a adição.
- **C6:** a inserção usa um só `PowerPoint.run`, captura IDs/intervalo antes do primeiro await, verifica PowerPointApi 1.5 e resolve o intervalo por slide/shape/posição/conteúdo. Ausência de intervalo usa o ID inicial; apresentação vazia usa C1. Falhas de escrita não desencadeiam uma segunda inserção.
- **C3:** novo `providers/mistralText.ts` normaliza strings/blocos e ignora conteúdo não textual tipado. `MistralProvider` usa o normalizador antes da conclusão; `BaseProvider` expõe a extração de deltas sem duplicar o transporte SSE.
- **C4:** o store contém estado/revisões do catálogo, preferências em memória e a consulta com IDs/cancelamento/guardas. `hooks/useModelCatalog.ts` fica sempre montado no Taskpane e aplica debounce só à edição da configuração. Seletores consomem o estado partilhado; todos os inícios de geração passam por `isModelReady`/`configured`. `ModelService` guarda a preferência com predicado de validade; a hidratação deixa essa leitura para a barreira de `modelWrites`, evitando snapshots antigos. O fornecedor usa a mesma fila das definições. Não há gravação automática completa por consulta de catálogo.
- **Integração:** avisos de possível criação parcial e indisponibilidade de modelos traduzidos nos cinco idiomas; erros apresentados numa área única em todos os separadores; README/INSTALL atualizados. A inserção de respostas existentes continua independente do catálogo. Nenhum teste foi acrescentado/alterado ou executado localmente pelo executor. Após o push solicitado, o CI automático do PR executou `npm test` e falhou nos mocks/fixtures anteriores; detalhes em `VALIDATION_REPORT.md`.

### Atualização documental no fim da implementação

1. Acrescentar a `VALIDATION_REPORT.md` uma secção datada **“Correções C1–C6”**, com branch/base efetiva, implementação por ID, comandos realmente executados e respetivos resultados.
2. Identificar separadamente: testes não executados por indicação do utilizador; testes que venham a ser executados numa fase posterior; ensaios pendentes por ambiente/credenciais; build/manifesto/auditoria não executados nesta revisão.
3. Conservar o histórico de resultados anteriores. A contagem histórica de testes não é a contagem de testes destas alterações.
4. Atualizar README/INSTALL apenas onde os comportamentos visíveis mudaram: indisponibilidade temporária do modelo, erros de conflito, fallback de inserção ou limitações reais de PowerPoint. Não declarar compatibilidade Office real sem ensaio.
5. Rever o diff final e listar ficheiros novos. Entregar um resumo curto de C1–C6, verificações estáticas e pendências. Se houver impedimento concreto, identificar exatamente a parte não concluída e a causa; continuar tudo o que não dependa dele.

### Fora do âmbito

Não refazer E1–E9/R1–R7, redesenhar o add-in, introduzir novos fornecedores, mudar a cifra/esquema de dados, percorrer grupos/tabelas/gráficos PowerPoint, otimizar globalmente todos os syncs ou atualizar dependências. Correções pontuais em consumidores necessários à integração C1–C6 fazem parte do plano.

## 9. Instrução pronta para o 6.1 Sol

> Lê `IMPLEMENTATION_PLAN_SOL.md` no repositório `/workspace/Office-add-in` e executa integralmente C1–C6, pela ordem recomendada, incluindo integração, traduções e documentação. Trabalha sobre as alterações locais existentes e preserva os ficheiros novos. Atualiza o quadro de progresso e acrescenta os resultados a `VALIDATION_REPORT.md`. Mantém os testes adiados: não acrescentes, alteres ou executes testes nesta fase. Executa typecheck, lint, format:check e git diff --check, corrige as falhas relevantes e distingue claramente essas verificações dos testes adiados e dos ensaios pendentes por falta de ambiente. Conclui todo o trabalho local possível sem parar para escolhas de implementação já resolvidas pelo plano.
