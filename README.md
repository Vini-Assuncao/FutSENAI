# FutSENAI ⚽

Aplicação web para registrar o futebol entre amigos: jogadores com nome e foto opcional, escalações que mudam a cada partida, gols por jogador em lote, histórico e estatísticas individuais.

## Recursos

- **Painel inicial:** jogadores ativos, partidas registradas, total e média de gols, partidas recentes e artilharia. No celular, as datas das últimas partidas usam o formato compacto `dd/mm/aaaa`.
- **Jogadores:** cadastro e edição do nome, foto principal e foto reserva opcional. O Overall exibido e usado no sorteio é calculado pela carta Incomum correspondente no FutSENAI Cards, sem aplicar os limites mínimos e máximos específicos das raridades; a foto reserva é usada na apresentação alternativa e, se estiver ausente, a foto principal continua sendo exibida.
- **Desempenho individual:** clique no cartão do jogador no elenco ou no nome dele na artilharia, no ranking ou na súmula para ver partidas, gols, assistências, vitórias, empates e derrotas separados entre jogos do 3º A e interclasse contra o 2º Ano. O histórico individual reúne as dez participações mais recentes dos dois modos, com acesso à súmula de cada partida.
- **Fotos ampliadas:** clique ou use Enter/Espaço em uma foto de jogador para abri-la em um pop-up quadrado de tamanho uniforme. Feche clicando fora, no botão × ou pressionando Esc.
- **Modo anti-resenha:** clique cinco vezes seguidas no logo FutSENAI para alternar o modo. A escolha fica salva neste navegador e é indicada discretamente por um ponto ao lado da marca; no modo alternativo, o slogan é ocultado.
- **Ranking interativo:** na página de estatísticas, clique nos cabeçalhos J, G, V, E, D ou Aprov. para ordenar pelos respectivos números. O padrão é gols, com aproveitamento como critério de desempate.
- **Preservação do histórico:** jogadores que já participaram de jogos podem ser arquivados e reativados, sem quebrar partidas passadas. Jogadores sem histórico podem ser excluídos.
- **Partidas internas:** registro da data e escalação, com local fixo como Quadra. Cada jogo tem os times Vermelho e Branco montados de novo; as equipes podem ser desbalanceadas (como 5 contra 6), desde que haja ao menos um jogador em cada lado.
- **Sorteio de times:** escolha os participantes e sorteie times Vermelho e Branco com quantidade equilibrada e diferença de Overall médio de até 6,1. Esse limite é a diferença mínima de 0,1 encontrada ao dividir os 11 jogadores atuais em times de seis e cinco, mais 6 pontos de Overall. O resultado mostra a média por jogador e, quando há quantidades diferentes, o time menor não fica com média inferior; se Jonas estiver selecionado, ele fica no time menor. Cada escalação é revelada com cartas animadas.
- **Partidas interclasse:** escolha o modo 3º A × 2º Ano. O 3º A tem escalação e gols individuais; o 2º Ano aparece em azul e é registrado somente pelo total de gols, sem cadastrar adversários nem atribuir gols individualmente.
- **Registro de gols em lote:** informe de uma vez a quantidade de gols regulares e gols contra de cada jogador. Em partidas interclasse, informe também o total de gols do 2º Ano. Os valores são somados ao placar existente.
- **Placar histórico interclasse:** painel dedicado a vitórias, empates e derrotas do 3º A contra o 2º Ano, além do total de gols marcados por cada turma.
- **Filtros globais de estatísticas:** disponíveis no painel inicial, na lista de jogadores, no histórico e na página de estatísticas: somente entre nós (3º A) ou somente contra o 2º Ano. Os números de cada categoria são exibidos separadamente, enquanto o placar histórico interclasse permanece claramente identificado como confronto direto.
- **Gol contra:** o jogador que fez o gol contra não recebe crédito de artilharia; o gol entra no placar do time adversário.
- **Resumo de gols agrupado:** os gols aparecem agrupados por jogador e tipo. O botão de menos desfaz um gol por vez daquele grupo.
- **Persistência real:** jogadores, partidas, escalações e gols são guardados em `public/data/futsenai.json`; as fotos principais e reservas ficam em `public/uploads/`.
- **Jornal FutSENAI:** carrossel lateral compacto com até três notícias recentes, capas, tags, datas, navegação e indicadores, rotação automática contínua e link para o jornal. Notícias publicadas nas últimas 12 horas recebem o destaque pulsante **“NOTÍCIA FRESCA!”**; o título aparece em letreiro horizontal contínuo e clicável no topo. Quando há notícia fresca, a data do topo fica oculta somente em telas mobile para dar mais espaço ao letreiro. No modo anti-resenha, as notícias da lateral e o letreiro ficam ocultos.
- **Re-sortear times:** o botão no resultado gera uma nova divisão usando os mesmos jogadores que já foram selecionados.
- **Modo de edição local:** ao abrir o FutSENAI em `http://localhost:3000`, a edição fica habilitada automaticamente e o indicador **MODO ADM ATIVO** aparece. O servidor aceita gravações somente de conexões locais quando está na porta 3000. Em hospedagens e cópias estáticas, o site fica somente para visualização, sem indicador.
- **Interface responsiva:** design branco e vermelho para computadores e celulares. A marca FutSENAI no menu lateral e no topo mobile abre a Visão geral; o breadcrumb no topo permite voltar a seções anteriores da hierarquia de navegação.

## Requisitos

- Node.js 22 ou superior.
- npm.

## Como executar

1. Baixe ou extraia o projeto e abra a pasta `FutSENAI` no terminal.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Inicie a aplicação:

   ```bash
   npm start
   ```

4. Acesse **http://localhost:3000** no navegador.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

Os registros iniciais estão incluídos em `public/data/futsenai.json`. O servidor atualiza esse arquivo ao cadastrar ou alterar jogadores, partidas e gols. As imagens ficam em `public/uploads/`. Para preservar os dados, mantenha ambos no projeto e faça backup antes de editar o JSON manualmente. O salvamento usa substituição atômica do arquivo para evitar deixar um JSON parcialmente escrito se ocorrer uma falha durante a gravação.

### Dados incluídos no repositório

O arquivo `public/data/futsenai.json` contém os jogadores e o histórico convertido do banco local usado durante o desenvolvimento, incluindo as partidas, escalações e gols já registrados. As fotos referenciadas por esse arquivo também precisam estar em `public/uploads/`. Novos dados gravados durante o uso ficam no arquivo JSON local; eles só aparecem no GitHub quando forem adicionados, commitados e enviados ao repositório. Como o arquivo inclui nomes e histórico de partidas, considere que esses registros ficarão públicos se o repositório for público.

Quando a API estiver indisponível, a interface tenta carregar esse JSON e permanece em modo somente leitura: painel, jogadores, partidas, detalhes e estatísticas continuam acessíveis, mas os controles de alteração ficam ocultos. Para usar esse modo, publique o conteúdo da pasta `public/` em um host estático; os caminhos dos recursos e das fotos são relativos para funcionar também sob um subcaminho. Os dados exibidos nesse modo são a cópia incluída na publicação e não são atualizados pelas alterações feitas em uma instância local do servidor.

## Estrutura

```text
FutSENAI/
├── server.js                    # ponto de entrada: inicia o servidor HTTP
├── server/                      # backend (Express)
│   ├── app.js                   # monta a aplicação, rotas e tratamento de erros
│   ├── config.js                # porta, pastas e origens de edição local
│   ├── data-store.js            # leitura e gravação atômica do JSON
│   ├── http.js                  # erros com status, validações e handler final
│   ├── local-editor.js          # bloqueia alterações fora de localhost:3000
│   ├── uploads.js               # upload e remoção das fotos
│   ├── stats.js                 # ponte para o cálculo compartilhado
│   └── routes/                  # players.js, matches.js, dashboard.js
├── public/                      # o que é publicado (também funciona como site estático)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── main.js              # inicialização da interface
│   │   ├── shared/futsenai-stats.js   # cálculos usados pelo servidor e pelo modo somente leitura
│   │   ├── api.js               # chamadas à API e modo somente leitura
│   │   ├── views/               # painel, jogadores, partidas, estatísticas, perfis e súmulas
│   │   ├── modals/              # formulários de jogador, partida e gols
│   │   ├── draw/teams.js        # sorteio de times e revelação das cartas
│   │   └── cards/               # integração com o FutSENAI Cards
│   ├── assets/                  # logos, capa do jornal e publicidade
│   ├── data/futsenai.json       # jogadores, partidas, escalações e gols
│   └── uploads/                 # fotos dos jogadores
├── package.json
└── README.md
```

## API REST

| Método | Rota | Ação |
|---|---|---|
| `GET` | `/api/health` | Estado do servidor |
| `GET` | `/api/dashboard?scope=internal\|interclass` | Indicadores, partidas recentes, artilharia e histórico interclasse filtrados |
| `GET` | `/api/players?scope=internal\|interclass` | Jogadores com estatísticas no filtro escolhido; `?includeInactive=true` inclui arquivados |
| `GET` | `/api/players/:id/history` | Desempenho do jogador separado entre partidas internas e interclasse, mais as dez participações recentes |
| `POST` | `/api/players` | Cria jogador (`multipart/form-data`: `name`, `photo` e `reserve_photo` opcionais) |
| `PUT` | `/api/players/:id` | Atualiza nome e/ou fotos (`photo`, `reserve_photo`) |
| `PATCH` | `/api/players/:id/archive` | Arquiva ou reativa jogador |
| `DELETE` | `/api/players/:id` | Exclui ou arquiva conforme o histórico |
| `GET` | `/api/matches?scope=internal\|interclass` | Lista partidas e placares filtrados |
| `GET` | `/api/matches/:id` | Detalhes, escalações e gols agrupáveis |
| `GET` | `/api/stats?scope=internal\|interclass` | Estatísticas e ranking da categoria escolhida, mais o histórico interclasse |
| `POST` | `/api/matches` | Cria partida (`played_on`, `participants`) |
| `DELETE` | `/api/matches/:id` | Exclui partida e gols relacionados |
| `POST` | `/api/matches/:id/goals` | Registra gols e assistências por jogador (`entries`) |
| `PUT` | `/api/matches/:id/goals` | Substitui os totais de gols, assistências e gols contra da partida |
| `DELETE` | `/api/matches/:matchId/goals/:goalId` | Remove um gol do histórico |
| `DELETE` | `/api/matches/:matchId/assists/:playerId` | Remove uma assistência do jogador naquela partida |

Exemplo de criação de partida:

```json
{
  "played_on": "2026-10-09",
  "opponent_type": "classmates",
  "participants": [
    { "player_id": 1, "team_side": "A" },
    { "player_id": 2, "team_side": "A" },
    { "player_id": 3, "team_side": "B" }
  ]
}
```

Exemplo de registro em lote de gols e assistências (as quantidades são somadas aos registros atuais):

```json
{
  "entries": [
    { "player_id": 1, "goals": 3, "assists": 1, "own_goals": 0 },
    { "player_id": 2, "goals": 1, "assists": 0, "own_goals": 1 },
    { "player_id": 3, "goals": 2, "assists": 2, "own_goals": 0 }
  ]
}
```

O `POST /api/matches/:id/goals` continua somando novos valores. Para substituir as estatísticas diretamente, use `PUT /api/matches/:id/goals` com os totais atuais desejados em `entries` para todos os jogadores escalados; `opponent_goals` e `opponent_own_goals` também representam os novos totais da partida.

`opponent_type` aceita `classmates` (jogo interno) ou `second_year` (interclasse contra o 2º Ano). `team_side` aceita `A` (Time Vermelho / 3º A) ou `B` (Time Branco / 2º Ano). Em partidas interclasse, todos os participantes devem usar `team_side: "A"`. Em `entries`, `goals` são gols regulares, `assists` são assistências e `own_goals` são gols contra, creditados no placar adversário. Para registrar gols agregados do 2º Ano, envie `opponent_goals` (gols do adversário) e `opponent_own_goals` (gols contra do adversário, creditados ao 3º A) junto com `entries`, por exemplo `{ "entries": [{ "player_id": 1, "goals": 2, "assists": 0, "own_goals": 0 }], "opponent_goals": 3, "opponent_own_goals": 1 }`.
