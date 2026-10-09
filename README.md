# FutSENAI ⚽

Aplicação web para registrar o futebol entre amigos: jogadores com nome e foto opcional, escalações que mudam a cada partida, gols por jogador em lote, histórico e estatísticas individuais.

## Recursos

- **Painel inicial:** jogadores ativos, partidas registradas, total e média de gols, partidas recentes e artilharia.
- **Jogadores:** cadastro e edição apenas do nome e foto opcional. As estatísticas individuais incluem partidas, gols, vitórias, empates, derrotas e aproveitamento.
- **Preservação do histórico:** jogadores que já participaram de jogos podem ser arquivados e reativados, sem quebrar partidas passadas. Jogadores sem histórico podem ser excluídos.
- **Partidas internas:** registro da data e escalação, com local fixo como Quadra. Cada jogo tem os times Vermelho e Branco montados de novo; as equipes podem ser desbalanceadas (como 5 contra 6), desde que haja ao menos um jogador em cada lado.
- **Partidas interclasse:** escolha o modo 3º A × 2º Ano. O 3º A tem escalação e gols individuais; o 2º Ano aparece em azul e é registrado somente pelo total de gols, sem cadastrar adversários nem atribuir gols individualmente.
- **Registro de gols em lote:** informe de uma vez a quantidade de gols regulares e gols contra de cada jogador. Em partidas interclasse, informe também o total de gols do 2º Ano. Os valores são somados ao placar existente.
- **Placar histórico interclasse:** painel dedicado a vitórias, empates e derrotas do 3º A contra o 2º Ano, além do total de gols marcados por cada turma.
- **Filtros globais de estatísticas:** disponíveis no painel inicial, na lista de jogadores, no histórico e na página de estatísticas: todas as partidas, somente entre nós (3º A) ou somente interclasse (3º A × 2º Ano). O filtro afeta os números e estatísticas individuais, enquanto o placar histórico interclasse permanece claramente identificado como confronto direto.
- **Gol contra:** o jogador que fez o gol contra não recebe crédito de artilharia; o gol entra no placar do time adversário.
- **Resumo de gols agrupado:** os gols aparecem agrupados por jogador e tipo. O botão de menos desfaz um gol por vez daquele grupo.
- **Persistência real:** banco de dados SQLite e fotos guardadas localmente, mantidos após reiniciar o servidor.
- **Interface responsiva:** design branco e vermelho para computadores e celulares.

## Requisitos

- Node.js 22 ou superior (Node.js 24 é compatível com a versão atual do `better-sqlite3`).
- npm.

## Como executar

1. Extraia o ZIP e abra a pasta `futsenai` no terminal.
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

O banco SQLite é criado automaticamente em `data/futsenai.sqlite`. As imagens ficam em `public/uploads/`. Faça backup desses locais para guardar registros e fotos.

### Atualização da versão anterior

Ao iniciar com um banco da versão anterior, o sistema migra automaticamente jogadores, fotos, datas das partidas, escalações e gols para o esquema simplificado. Campos antigos que não são mais usados (apelido, posição, número de camisa, duração, nome customizado de time, minuto e tipo detalhado do gol) são removidos. Os registros de gol contra são preservados. Se a base ainda não tiver a coluna `opponent_type`, ela é adicionada automaticamente e as partidas antigas passam a ser classificadas como jogos internos do 3º A.

## Estrutura

```text
futsenai/
├── database.js             # esquema e migração do SQLite
├── server.js               # API REST, validações e servidor web
├── package.json
├── data/                   # banco criado automaticamente
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── uploads/             # fotos dos jogadores
```

## API REST

| Método | Rota | Ação |
|---|---|---|
| `GET` | `/api/health` | Estado do servidor |
| `GET` | `/api/dashboard?scope=all\|internal\|interclass` | Indicadores, partidas recentes, artilharia e histórico interclasse filtrados |
| `GET` | `/api/players?scope=all\|internal\|interclass` | Jogadores com estatísticas no filtro escolhido; `?includeInactive=true` inclui arquivados |
| `POST` | `/api/players` | Cria jogador (`multipart/form-data`: `name`, `photo` opcional) |
| `PUT` | `/api/players/:id` | Atualiza nome e/ou foto |
| `PATCH` | `/api/players/:id/archive` | Arquiva ou reativa jogador |
| `DELETE` | `/api/players/:id` | Exclui ou arquiva conforme o histórico |
| `GET` | `/api/matches?scope=all\|internal\|interclass` | Lista partidas e placares filtrados |
| `GET` | `/api/matches/:id` | Detalhes, escalações e gols agrupáveis |
| `GET` | `/api/stats?scope=all\|internal\|interclass` | Estatísticas agregadas e ranking filtrados, mais o histórico interclasse |
| `POST` | `/api/matches` | Cria partida (`played_on`, `participants`) |
| `DELETE` | `/api/matches/:id` | Exclui partida e gols relacionados |
| `POST` | `/api/matches/:id/goals` | Registra quantidades por jogador (`entries`) |
| `DELETE` | `/api/matches/:matchId/goals/:goalId` | Remove um gol do histórico |

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

Exemplo de registro em lote de gols (as quantidades são somadas ao placar atual):

```json
{
  "entries": [
    { "player_id": 1, "goals": 3, "own_goals": 0 },
    { "player_id": 2, "goals": 1, "own_goals": 1 },
    { "player_id": 3, "goals": 2, "own_goals": 0 }
  ]
}
```

`opponent_type` aceita `classmates` (jogo interno) ou `second_year` (interclasse contra o 2º Ano). `team_side` aceita `A` (Time Vermelho / 3º A) ou `B` (Time Branco / 2º Ano). Em partidas interclasse, todos os participantes devem usar `team_side: "A"`. Em `entries`, `goals` são gols regulares e `own_goals` são gols contra, creditados no placar adversário. Para lançar gols do 2º Ano sem artilharia individual, envie `opponent_goals` junto com `entries`, por exemplo `{ "entries": [{ "player_id": 1, "goals": 2, "own_goals": 0 }], "opponent_goals": 3 }`.
