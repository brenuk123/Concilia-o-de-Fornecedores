# Consolidação Inteligente de Múltiplas Lojas por Código de Fornecedor

Entrega a consolidação automática por **Código de Fornecedor** mesmo quando cada loja possui razão social/nome diferente no TOTVS Protheus (como o código `001760`, onde a Loja `01` é *RONALDO ANDRADE DE MORAIS* com R$ 5.616,30 e a Loja `02` é *ALAN FERNANDO DE MORAIS* com R$ 36.211,77), somando os saldos das lojas (R$ 41.828,07) para bater com o saldo consolidado do Balancete (R$ 41.828,07 = `Saldo OK`), exibindo todos os nomes e valores por loja e destacando em qual loja ocorreu a correspondência contábil.

## Revisão e Decisões Confirmadas

> [!IMPORTANT]
> As decisões abaixo foram confirmadas e preservam 100% do layout atual e das regras contábeis já aprovadas (isolamento Ativo `1.1.0.60.*` para PA e Passivo `2.1.0.10.*`/`2.2.0.10.2.*` para Contas a Pagar, sem contas sintéticas e sem impostos/bancos/salários/clientes).

- **Decisão Confirmada 1 (Consolidação Padrão por Código)**: Consolidar sempre por código de fornecedor (forçando `separarPorLoja = false` como padrão e migrando estados salvos no navegador), somando todas as lojas na linha principal e exibindo o subtotal de cada loja tanto na linha consolidada quanto na estrutura expansível `[+]` do Excel.
- **Decisão Confirmada 2 (Detalhamento Multi-Loja e Origem do Match)**: Na coluna **Loja(s)** mostrar todas as lojas (ex.: `01, 02`) com indicação da loja que gerou o vínculo com o Balancete, e na coluna **Fornecedor** exibir todos os nomes e saldos por loja (ex.: `Loja 01: RONALDO ANDRADE DE MORAIS (R$ 5.616,30) [Match Balancete] | Loja 02: ALAN FERNANDO DE MORAIS (R$ 36.211,77)`).

---

## 1. Visão Geral e Conceito Central

- **O que faz**: No TOTVS Protheus, produtores rurais, grupos familiares ou filiais frequentemente compartilham o mesmo **Código** (`001760`), mas possuem nomes distintos na **Loja `01`** e na **Loja `02`**, enquanto a Contabilidade centraliza o saldo inteiro na conta analítica de apenas um dos titulares no Balancete (`1.1.0.60.101.832 - RONALDO ANDRADE DE MORAIS`). O motor passa a indexar **todos os nomes distintos das lojas** daquele código para encontrar a conta do Balancete e confronta a **soma de todas as lojas** com o saldo contábil.
- **Valor Principal**: Elimina falsas divergências entre lojas do mesmo código (como os `R$ 36.211,77` e `-R$ 36.211,77` que se anulavam quando avaliados separadamente ou quando apenas um dos nomes era testado) e documenta com transparência na tela e no Excel quanto veio de cada loja e qual loja originou o vínculo com o Balancete.

---

## 2. Experiência do Usuário e Design Visual

- **Manutenção Integral do Layout Atual**:
  - Mantém a estética corporativa sóbria (`Slate 900` `#0F172A`, superfície clara `#F8FAFC`/`#FFFFFF`, tipografia tabular `font-mono tabular-nums` para todos os números e códigos).
- **Apresentação na Tabela Web (`Contas a Pagar` e `Pagamento Antecipado`)**:
  - **Coluna `Loja(s)`**: Exibe `01, 02` e, quando houver mais de uma loja, indica abaixo de forma compacta `Match: Loja 01`.
  - **Coluna `Fornecedor (Relatório)`**:
    - Quando o código possui 1 única loja (ou mesmo nome em todas as lojas com 1 loja): exibe o nome normalmente.
    - Quando o código possui múltiplas lojas (ex.: `01` e `02`): exibe todos os nomes distintos e um resumo direto por loja logo abaixo:
      - `Loja 01: RONALDO ANDRADE DE MORAIS — R$ 5.616,30 (Match Balancete)`
      - `Loja 02: ALAN FERNANDO DE MORAIS — R$ 36.211,77`
  - **Coluna `Saldo Relatório`**: Exibe a soma consolidada de todas as lojas (`R$ 41.828,07`) comparada diretamente com o `Saldo Balancete` (`R$ 41.828,07`), resultando em Conferência `-` (`0,00`) e status automático **`Saldo OK`**.
- **Apresentação no Excel Exportado (`.xlsx`)**:
  - **Linha Consolidada do Fornecedor (Nível 0)**:
    - Coluna **Loja(s)**: `01, 02 (Match: 01)`
    - Coluna **Fornecedor / Histórico da Operação**: Exibe os nomes consolidados e o resumo dos saldos por loja na própria célula (ex.: `RONALDO ANDRADE DE MORAIS / ALAN FERNANDO DE MORAIS [Loja 01: R$ 5.616,30 (Match) | Loja 02: R$ 36.211,77]`).
    - Também corrige a largura das colunas de valores e aplica `SUBTOTAL(9, ...)` na coluna `Saldo no Balancete` do rodapé para evitar `#########` no Excel.
  - **Linhas Filhas no `[+]` do Excel (Nível 1)**:
    - Cada título expandido mostra claramente `Loja 01 — RONALDO ANDRADE DE MORAIS` ou `Loja 02 — ALAN FERNANDO DE MORAIS`, mantendo a soma dinâmica via `=SUBTOTAL(9, ...)` sem duplicar valores.

---

## 3. Decisões de Produto e Arquitetura

- **Decisão 1: Motor de Correspondência Multi-Nome por Loja**
  - *Abordagem Escolhida*: Cada grupo consolidado por `codigo` armazena a lista de nomes e nomes normalizados de **todas as suas lojas** (`lojasNomes`). Nos Passos 2 (Exata), 3 (Truncada), 4 (Similaridade) e 6 (Escopo Ampliado), o motor testa a conta analítica do Balancete contra **todos os nomes das lojas do código** e registra exatamente qual loja (`lojaMatch` e `nomeLojaMatch`) gerou a melhor correspondência.
  - *Por quê*: Garante que, mesmo que a Loja `02` tenha mais títulos ou nome mais longo (*ALAN FERNANDO DE MORAIS*), o motor encontre a conta do Balancete registrada no nome da Loja `01` (*RONALDO ANDRADE DE MORAIS*) e concilie o saldo total (`36.211,77 + 5.616,30 = 41.828,07`).
- **Decisão 2: Migração Automática para Visão Consolidada**
  - *Abordagem Escolhida*: Ao inicializar o aplicativo, garante que `separarPorLoja` inicie desmarcado (`false`), mesmo que tenha ficado salvo como `true` no `localStorage` em uma sessão anterior, mantendo o seletor disponível na barra de filtros caso o usuário deseje inspecionar desagrupado temporariamente.

---

## 4. Arquitetura Técnica e Fluxo de Dados

```
┌────────────────────────────────────────────────────────────────────────────┐
│                Títulos a Pagar (TOTVS Protheus - .xlsx)                    │
│   001760-01 RONALDO ANDRADE DE MORAIS (1 tít. = R$  5.616,30)              │
│   001760-02 ALAN FERNANDO DE MORAIS   (8 tít. = R$ 36.211,77)              │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│           Agrupador Consolidado por Código (FornecedorAgrupado)            │
│   • Código: 001760  |  Lojas: ["01", "02"]                                 │
│   • Loja 01: RONALDO ANDRADE DE MORAIS -> Subtotal: R$  5.616,30 (1 tít.)  │
│   • Loja 02: ALAN FERNANDO DE MORAIS   -> Subtotal: R$ 36.211,77 (8 tít.)  │
│   • Saldo Consolidado no Relatório:       R$ 41.828,07 (9 tít.)            │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│        Motor de Correspondência Multi-Loja × Balancete Analítico           │
│   Testa nomes de todas as lojas (01 e 02) contra contas do Balancete       │
│   ──► Match Exato (100%) na Loja 01 com 1.1.0.60.101.832 (R$ 41.828,07)    │
│   ──► Conferência: 41.828,07 − 41.828,07 = 0,00 ──► Status: Saldo OK       │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
┌─────────────────────────────────────┐ ┌────────────────────────────────────┐
│     Tabela Web (Reconciliation)     │ │    Exportação Excel (.xlsx)        │
│ • Loja(s): 01, 02 (Match: Loja 01)  │ │ • Linha Nível 0 Consolidada com    │
│ • Todos os nomes e saldos por loja  │ │   nomes, valores por loja e match  │
│ • Expansão detalhada por loja       │ │ • Drill-down [+] com Loja + Nome   │
└─────────────────────────────────────┘ └────────────────────────────────────┘
```

### Entidades Atualizadas
- **`LojaConsolidada`**: Passa a armazenar também `nomeLoja` (nome do fornecedor específico daquela loja), `nomeLojaNormalizado` e `isMatchBalancete` (indicando se o match contábil ocorreu através do nome/valor daquela loja).
- **`LinhaConciliacao`**: Passa a incluir `nomesLojasDistintos: string[]`, `lojaMatch?: string` (ex.: `'01'`) e `resumoLojasTexto: string` (ex.: `'Loja 01: R$ 5.616,30 (Match) | Loja 02: R$ 36.211,77'`) para exibição imediata tanto na tabela em tela quanto nas planilhas exportadas.
