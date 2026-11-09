import {
  AbaPrincipal,
  AppConfig,
  ContaBalancete,
  DeParaRule,
  LinhaConciliacao,
  LojaConsolidada,
  MotivoSugerido,
  OverrideUsuario,
  StatusConciliacao,
  TipoCorrespondencia,
  TituloPagar,
} from '../types/reconciliation';
import {
  calcularSimilaridadeNomes,
  contaPertenceAPrefixoContabil,
  formatarMoeda,
  isContaBalanceteExcluidaEscopo,
  isNomeTruncado,
  isTituloExcluidoEscopo,
  normalizarNome,
  round2,
} from './normalization';

interface FornecedorAgrupado {
  chave: string; // codigo (ou codigo-loja)
  codigo: string;
  nome: string;
  nomeNormalizado: string;
  formatoNaoReconhecido: boolean;
  lojasMap: Map<string, TituloPagar[]>;
  nomesPorLoja: Map<string, { nome: string; nomeNormalizado: string }>;
  todosTitulos: TituloPagar[];
  saldoBruto: number;
  saldoExibicao: number;
}

/**
 * Verifica se a conta pertence à natureza contábil correta da aba:
 * - Pagamento Antecipado (PA) = ATIVO (1.x)
 * - Contas a Pagar (CAP) = PASSIVO (2.x)
 */
export function contaTemNaturezaCorretaParaAba(
  conta: string,
  aba: AbaPrincipal
): boolean {
  const c = (conta || '').trim();
  if (aba === 'PA') {
    return c.startsWith('1.');
  }
  return c.startsWith('2.');
}

export function contaPertenceAoEscopo(
  conta: string,
  aba: AbaPrincipal,
  config: AppConfig
): boolean {
  if (!contaTemNaturezaCorretaParaAba(conta, aba)) {
    return false;
  }
  const prefixos = aba === 'CAP' ? config.prefixosCAP : config.prefixosPA;

  return prefixos.some((pref) => contaPertenceAPrefixoContabil(conta, pref));
}

export function contaEhElegivelParaAba(
  c: ContaBalancete,
  aba: AbaPrincipal,
  config: AppConfig
): boolean {
  if (!c.isAnalitica) {
    return false;
  }
  // Isolamento estrito: PA só cruza com ATIVO (1.x) e CAP só cruza com PASSIVO (2.x)
  if (!contaTemNaturezaCorretaParaAba(c.conta, aba)) {
    return false;
  }
  if (isContaBalanceteExcluidaEscopo(c.conta, c.descricao, c.grupoDescricao)) {
    return false;
  }

  if (aba === 'PA') {
    const prefixosAtivoPA = [
      ...config.prefixosPA,
      '1.1.0.60.1',
      '1.1.0.60.2',
      '1.1.0.60.7',
    ];
    if (
      prefixosAtivoPA.some((pref) =>
        contaPertenceAPrefixoContabil(c.conta, pref)
      )
    ) {
      return true;
    }
    const grpUpper = (c.grupoDescricao || '').toUpperCase();
    return grpUpper.includes('FORNECEDOR');
  }

  // aba === 'CAP' (Passivo 2.x)
  const prefixosPassivoCAP = [
    ...config.prefixosCAP,
    '2.1.0.10',
    '2.2.0.10.2',
    '2.2.0.10',
  ];
  if (
    prefixosPassivoCAP.some((pref) =>
      contaPertenceAPrefixoContabil(c.conta, pref)
    )
  ) {
    return true;
  }
  const grpUpper = (c.grupoDescricao || '').toUpperCase();
  return grpUpper.includes('FORNECEDOR');
}

function obterSaldoContaNaAba(conta: ContaBalancete, aba: AbaPrincipal): number {
  return aba === 'PA' ? conta.saldoPA : conta.saldoPassivo;
}

/**
 * Gera motivos sugeridos automaticamente quando houver diferença (nunca aplica sem confirmação)
 */
function gerarMotivosSugeridos(
  forn: FornecedorAgrupado,
  contasVinculadas: ContaBalancete[],
  conferencia: number,
  tipoCorrespondencia: TipoCorrespondencia,
  tolerancia: number,
  todosFornecedoresMesmoCodigo: FornecedorAgrupado[],
  lojasLista: LojaConsolidada[]
): MotivoSugerido[] {
  const sugestoes: MotivoSugerido[] = [];
  const absDiff = Math.abs(conferencia);

  // Se houver correspondência em escopo ampliado, sugere o grupo contábil
  if (tipoCorrespondencia === 'Ampliada' && contasVinculadas.length > 0) {
    const grupo =
      contasVinculadas[0].grupoDescricao || 'outra conta patrimonial';
    sugestoes.push({
      motivo: `Contabilizado em ${grupo}`,
      detalhe: `Conta ${contasVinculadas[0].conta} pertence ao grupo "${grupo}"`,
    });
  }

  if (absDiff <= tolerancia) {
    return sugestoes;
  }

  const tolMatch = Math.max(0.02, tolerancia);

  // 1. Diferença igual à soma dos títulos NDF do fornecedor -> "NDF"
  const titulosNDF = forn.todosTitulos.filter((t) => t.tp === 'NDF');
  if (titulosNDF.length > 0) {
    const somaNDF = round2(titulosNDF.reduce((acc, t) => acc + Math.abs(t.saldo), 0));
    if (
      Math.abs(absDiff - somaNDF) <= tolMatch ||
      Math.abs(absDiff - somaNDF * 2) <= tolMatch
    ) {
      sugestoes.push({
        motivo: 'NDF (Nota de Débito de Fornecedor)',
        detalhe: `Soma dos títulos NDF (${formatarMoeda(somaNDF)}) explica a diferença`,
      });
    }
  }

  // 2. Diferença igual ao valor de um título específico -> "Pendente de apropriação da nota nº X"
  for (const tit of forn.todosTitulos) {
    const valTit = Math.abs(tit.saldo);
    if (valTit > 0 && Math.abs(absDiff - valTit) <= tolMatch) {
      const numNota = tit.prfNumeroParcela || 'S/N';
      sugestoes.push({
        motivo: `Pendente de apropriação da nota nº ${numNota}`,
        detalhe: `Título ${numNota} (${tit.tp}) possui saldo exato de R$ ${formatarMoeda(valTit)}`,
      });
      break;
    }
  }

  // 3. Diferença igual ao saldo de outra loja do mesmo código -> "Saldo em outra loja/cadastro"
  if (lojasLista.length > 1) {
    for (const lojaItem of lojasLista) {
      if (
        Math.abs(lojaItem.saldoExibicao) > 0 &&
        Math.abs(absDiff - Math.abs(lojaItem.saldoExibicao)) <= tolMatch
      ) {
        sugestoes.push({
          motivo: 'Saldo em outra loja/cadastro',
          detalhe: `A diferença equivale ao saldo da loja ${lojaItem.loja} - ${lojaItem.nomeLoja} (R$ ${formatarMoeda(lojaItem.saldoExibicao)})`,
        });
        break;
      }
    }
  } else if (todosFornecedoresMesmoCodigo.length > 1) {
    for (const outro of todosFornecedoresMesmoCodigo) {
      if (
        outro.chave !== forn.chave &&
        Math.abs(absDiff - Math.abs(outro.saldoExibicao)) <= tolMatch
      ) {
        sugestoes.push({
          motivo: 'Saldo em outra loja/cadastro',
          detalhe: `Diferença equivale ao saldo de outra filial do código ${forn.codigo}`,
        });
        break;
      }
    }
  }

  // 4. Fornecedor com títulos com Dias Atraso > 365 -> "Saldo antigo vencido"
  const qtdAntigos = forn.todosTitulos.filter((t) => t.diasAtraso > 365).length;
  if (qtdAntigos > 0) {
    sugestoes.push({
      motivo: 'Saldo antigo vencido',
      detalhe: `${qtdAntigos} título(s) vencido(s) há mais de 365 dias`,
    });
  }

  // 5. Título com Valor Original != saldo -> "Relatório com valor original do título"
  const titulosComDifOriginal = forn.todosTitulos.filter(
    (t) => t.alertaValorOriginalDifere
  );
  if (titulosComDifOriginal.length > 0) {
    sugestoes.push({
      motivo: 'Relatório com valor original do título',
      detalhe: `${titulosComDifOriginal.length} título(s) com Valor Original diferente do saldo nominal`,
    });
  }

  // 6. Nome diferente entre os lados -> "Nome divergente: <nome no balancete>"
  if (contasVinculadas.length > 0) {
    const contaPrincipal = contasVinculadas[0];
    const algumNomeIgual = Array.from(forn.nomesPorLoja.values()).some(
      (n) => n.nomeNormalizado === contaPrincipal.nomeNormalizado
    );
    if (contaPrincipal.nomeNormalizado && !algumNomeIgual) {
      sugestoes.push({
        motivo: `Nome divergente: ${contaPrincipal.descricao}`,
        detalhe: `Relatório: "${forn.nome}" × Balancete: "${contaPrincipal.descricao}"`,
      });
    }
  }

  return sugestoes;
}

/**
 * Executa a conciliação completa para uma aba ('CAP' ou 'PA')
 */
export function executarConciliacaoAba(
  aba: AbaPrincipal,
  todosTitulos: TituloPagar[],
  contasAnaliticas: ContaBalancete[],
  config: AppConfig,
  regrasDePara: DeParaRule[],
  overrides: Record<string, OverrideUsuario>
): LinhaConciliacao[] {
  // 1. Filtra títulos da aba (garantindo exclusão de impostos, bancos, salários e clientes)
  const titulosAba = todosTitulos.filter(
    (t) =>
      !isTituloExcluidoEscopo(t.tp, t.codigo, t.nome, t.historico) &&
      (aba === 'PA' ? t.tp === 'PA' : t.tp !== 'PA')
  );

  // 2. Agrupa fornecedores por Código (ou Código-Loja se separarPorLoja estiver ativo)
  // Preservando TODOS os nomes por loja para quando um código tiver várias lojas com nomes diferentes (ex: 001760)
  const gruposFornecedor = new Map<string, FornecedorAgrupado>();
  const porCodigoMap = new Map<string, FornecedorAgrupado[]>();

  for (const tit of titulosAba) {
    const chave = config.separarPorLoja
      ? `${tit.codigo}-${tit.loja}`
      : tit.codigo;

    let grp = gruposFornecedor.get(chave);
    if (!grp) {
      grp = {
        chave,
        codigo: tit.codigo,
        nome: tit.nome,
        nomeNormalizado: tit.nomeNormalizado,
        formatoNaoReconhecido: tit.formatoNaoReconhecido,
        lojasMap: new Map(),
        nomesPorLoja: new Map(),
        todosTitulos: [],
        saldoBruto: 0,
        saldoExibicao: 0,
      };
      gruposFornecedor.set(chave, grp);

      const listaCod = porCodigoMap.get(tit.codigo) || [];
      listaCod.push(grp);
      porCodigoMap.set(tit.codigo, listaCod);
    }

    // Registra/atualiza o nome específico desta loja
    const atualLoja = grp.nomesPorLoja.get(tit.loja);
    if (
      !atualLoja ||
      (tit.nome.length > atualLoja.nome.length && !tit.formatoNaoReconhecido)
    ) {
      grp.nomesPorLoja.set(tit.loja, {
        nome: tit.nome,
        nomeNormalizado: tit.nomeNormalizado,
      });
    }

    if (tit.nome.length > grp.nome.length && !tit.formatoNaoReconhecido) {
      grp.nome = tit.nome;
      grp.nomeNormalizado = tit.nomeNormalizado;
    }

    grp.todosTitulos.push(tit);
    grp.saldoBruto = round2(grp.saldoBruto + tit.saldo);

    const listaLoja = grp.lojasMap.get(tit.loja) || [];
    listaLoja.push(tit);
    grp.lojasMap.set(tit.loja, listaLoja);
  }

  // Calcula saldoExibicao (na aba PA multiplica por -1 para ficar positivo)
  for (const grp of gruposFornecedor.values()) {
    grp.saldoExibicao =
      aba === 'PA' ? round2(grp.saldoBruto * -1) : grp.saldoBruto;
  }

  // Helper para listar todos os pares (loja, nomeNormalizado) de um fornecedor agrupado, ordenados por loja
  const obterLojasNomesDoGrupo = (forn: FornecedorAgrupado) => {
    return Array.from(forn.nomesPorLoja.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([loja, info]) => ({
        loja,
        nome: info.nome,
        nomeNormalizado: info.nomeNormalizado,
      }))
      .filter((x) => Boolean(x.nomeNormalizado));
  };

  // Helper para identificar qual loja gerou o match com a conta contábil escolhida
  const identificarLojaDoMatch = (
    forn: FornecedorAgrupado,
    contas: ContaBalancete[]
  ): string | undefined => {
    if (contas.length === 0) return undefined;
    const lojasNomes = obterLojasNomesDoGrupo(forn);
    if (lojasNomes.length <= 1) {
      return lojasNomes[0]?.loja;
    }

    const lojasCasadas: string[] = [];
    for (const ln of lojasNomes) {
      const bateExatoOuTruncado = contas.some(
        (c) =>
          c.nomeNormalizado === ln.nomeNormalizado ||
          isNomeTruncado(ln.nomeNormalizado, c.nomeNormalizado)
      );
      if (bateExatoOuTruncado) {
        lojasCasadas.push(ln.loja);
      }
    }
    if (lojasCasadas.length > 0) {
      return lojasCasadas.join(', ');
    }

    // Se foi por similaridade, pega a loja com maior score contra a primeira conta
    let melhorLoja = lojasNomes[0].loja;
    let maiorSim = -1;
    for (const ln of lojasNomes) {
      for (const c of contas) {
        const sim = calcularSimilaridadeNomes(
          ln.nomeNormalizado,
          c.nomeNormalizado
        );
        if (sim > maiorSim) {
          maiorSim = sim;
          melhorLoja = ln.loja;
        }
      }
    }
    return melhorLoja;
  };

  // 3. Separa contas analíticas do escopo padrão vs outras subcontas elegíveis da mesma natureza (Ativo p/ PA, Passivo p/ CAP)
  const contasEscopoPadrao: ContaBalancete[] = [];
  const contasForaEscopo: ContaBalancete[] = [];
  const mapaContasPorCodigo = new Map<string, ContaBalancete>();

  for (const c of contasAnaliticas) {
    if (!contaEhElegivelParaAba(c, aba, config)) {
      continue;
    }
    mapaContasPorCodigo.set(c.conta, c);
    if (contaPertenceAoEscopo(c.conta, aba, config)) {
      contasEscopoPadrao.push(c);
    } else {
      contasForaEscopo.push(c);
    }
  }

  const contasUsadas = new Set<string>();
  const fornecedoresCasados = new Set<string>();

  // Estrutura temporária de resultado de matching por fornecedor
  interface MatchInfo {
    contas: ContaBalancete[];
    tipo: TipoCorrespondencia;
    confianca: number;
    exigeConfirmacao: boolean;
    confirmadoUsuario: boolean;
    lojaMatch?: string;
    grupoId?: string;
    grupoLabel?: string;
    grupoFornecedoresKeys?: string[];
  }

  const matchesPorFornecedor = new Map<string, MatchInfo>();
  const regrasAba = regrasDePara.filter((r) => r.aba === aba);

  // Helper para escolher a melhor conta (ou conjunto de contas de subgrupos diferentes com saldo) entre candidatas do mesmo fornecedor
  const selecionarMelhoresContasCandidatas = (
    forn: FornecedorAgrupado,
    candidatas: ContaBalancete[]
  ): ContaBalancete[] => {
    if (candidatas.length === 1) return [candidatas[0]];

    const comSaldo = candidatas.filter(
      (c) => Math.abs(obterSaldoContaNaAba(c, aba)) > 0.005
    );

    // Se o fornecedor possui mais de uma conta analítica com saldo (ex: 1.1.0.60.1 Matéria Prima + 1.1.0.60.2 Extra Sucata,
    // ou contas separadas para Loja 01 e Loja 02) e a soma das contas com saldo bate mais perto do relatório do que uma conta isolada, agrupa
    if (comSaldo.length > 1 && Math.abs(forn.saldoExibicao) > 0.005) {
      const somaSaldos = round2(
        comSaldo.reduce((acc, c) => acc + obterSaldoContaNaAba(c, aba), 0)
      );
      const diffSoma = Math.abs(forn.saldoExibicao - somaSaldos);
      const menorDiffIndividual = Math.min(
        ...comSaldo.map((c) =>
          Math.abs(forn.saldoExibicao - obterSaldoContaNaAba(c, aba))
        )
      );
      if (diffSoma + 0.01 < menorDiffIndividual) {
        return comSaldo;
      }
    }

    const ordenadas = [...candidatas].sort((a, b) => {
      const saldoA = obterSaldoContaNaAba(a, aba);
      const saldoB = obterSaldoContaNaAba(b, aba);
      if (Math.abs(forn.saldoExibicao) > 0.005) {
        const aTemSaldo = Math.abs(saldoA) > 0.005 ? 0 : 1;
        const bTemSaldo = Math.abs(saldoB) > 0.005 ? 0 : 1;
        if (aTemSaldo !== bTemSaldo) return aTemSaldo - bTemSaldo;
      }
      return (
        Math.abs(forn.saldoExibicao - saldoA) -
        Math.abs(forn.saldoExibicao - saldoB)
      );
    });

    return [ordenadas[0]];
  };

  // =========================================================================
  // PASSO 1: De-Para manual salvo (prioridade máxima, suporta 1:1, 1:N, N:1, N:M)
  // =========================================================================
  let contadorGrupo = 1;
  for (const regra of regrasAba) {
    const fornsDaRegra: FornecedorAgrupado[] = [];
    for (const forn of gruposFornecedor.values()) {
      const nomesNormGrupo = obterLojasNomesDoGrupo(forn).map(
        (x) => x.nomeNormalizado
      );
      const bateChave =
        regra.fornecedorKeys.includes(forn.chave) ||
        regra.fornecedorKeys.includes(forn.codigo) ||
        regra.fornecedorNomes.some((n) => {
          const nn = normalizarNome(n);
          return nn !== '' && nomesNormGrupo.includes(nn);
        });
      if (bateChave) {
        fornsDaRegra.push(forn);
      }
    }

    if (fornsDaRegra.length === 0) continue;

    const contasDaRegra = regra.contasCodigos
      .map((cod) => mapaContasPorCodigo.get(cod))
      .filter((c): c is ContaBalancete => Boolean(c));

    // Se nenhuma conta da regra pertence à natureza desta aba no Balancete atual, ignora a regra
    if (contasDaRegra.length === 0) continue;

    const isMultiGrupo =
      fornsDaRegra.length > 1 || contasDaRegra.length > 1;
    const grupoId = isMultiGrupo ? `GRP-${regra.id}` : undefined;
    const grupoLabel = isMultiGrupo ? `Grupo ${contadorGrupo++}` : undefined;
    const grupoKeys = isMultiGrupo ? fornsDaRegra.map((f) => f.chave) : undefined;

    for (const forn of fornsDaRegra) {
      fornecedoresCasados.add(forn.chave);
      matchesPorFornecedor.set(forn.chave, {
        contas: contasDaRegra,
        tipo: 'Manual',
        confianca: 100,
        exigeConfirmacao: false,
        confirmadoUsuario: true,
        lojaMatch: identificarLojaDoMatch(forn, contasDaRegra),
        grupoId,
        grupoLabel,
        grupoFornecedoresKeys: grupoKeys,
      });
    }

    for (const c of contasDaRegra) {
      contasUsadas.add(c.conta);
    }
  }

  // =========================================================================
  // PASSO 2: Nome normalizado idêntico (testando os nomes de TODAS as lojas do código)
  // =========================================================================
  for (const forn of gruposFornecedor.values()) {
    if (fornecedoresCasados.has(forn.chave)) continue;
    const lojasNomes = obterLojasNomesDoGrupo(forn);
    if (lojasNomes.length === 0) continue;

    const candidatas = contasEscopoPadrao.filter(
      (c) =>
        !contasUsadas.has(c.conta) &&
        lojasNomes.some((ln) => c.nomeNormalizado === ln.nomeNormalizado)
    );

    if (candidatas.length > 0) {
      const escolhidas = selecionarMelhoresContasCandidatas(forn, candidatas);
      for (const esc of escolhidas) {
        contasUsadas.add(esc.conta);
      }
      fornecedoresCasados.add(forn.chave);
      matchesPorFornecedor.set(forn.chave, {
        contas: escolhidas,
        tipo: 'Exata',
        confianca: 100,
        exigeConfirmacao: false,
        confirmadoUsuario: true,
        lojaMatch: identificarLojaDoMatch(forn, escolhidas),
      });
    }
  }

  // =========================================================================
  // PASSO 3: Nome truncado (testando os nomes de TODAS as lojas do código, mín. 15 chars)
  // =========================================================================
  for (const forn of gruposFornecedor.values()) {
    if (fornecedoresCasados.has(forn.chave)) continue;
    const lojasNomes = obterLojasNomesDoGrupo(forn);
    if (lojasNomes.length === 0) continue;

    const candidatas = contasEscopoPadrao.filter(
      (c) =>
        !contasUsadas.has(c.conta) &&
        lojasNomes.some((ln) => isNomeTruncado(ln.nomeNormalizado, c.nomeNormalizado))
    );

    if (candidatas.length > 0) {
      const escolhidas = selecionarMelhoresContasCandidatas(forn, candidatas);
      for (const esc of escolhidas) {
        contasUsadas.add(esc.conta);
      }
      fornecedoresCasados.add(forn.chave);
      matchesPorFornecedor.set(forn.chave, {
        contas: escolhidas,
        tipo: 'Truncada',
        confianca: 96,
        exigeConfirmacao: false,
        confirmadoUsuario: true,
        lojaMatch: identificarLojaDoMatch(forn, escolhidas),
      });
    }
  }

  // =========================================================================
  // PASSO 4: Similaridade (Jaro-Winkler + Jaccard testando TODAS as lojas do código)
  // >= limiarAproximada (0.90) = "Aproximada" (aceita automaticamente)
  // Entre limiarSugerida (0.75) e limiarAproximada (0.90) = "Sugerida" (exige confirmação)
  // =========================================================================
  interface ParSimilaridade {
    forn: FornecedorAgrupado;
    conta: ContaBalancete;
    score: number;
    lojaMatch: string;
  }

  const paresCandidatos: ParSimilaridade[] = [];
  for (const forn of gruposFornecedor.values()) {
    if (fornecedoresCasados.has(forn.chave)) continue;
    const lojasNomes = obterLojasNomesDoGrupo(forn);
    if (lojasNomes.length === 0) continue;

    for (const conta of contasEscopoPadrao) {
      if (contasUsadas.has(conta.conta) || !conta.nomeNormalizado) continue;

      let melhorScoreLoja = 0;
      let melhorLoja = lojasNomes[0].loja;
      for (const ln of lojasNomes) {
        const sc = calcularSimilaridadeNomes(
          ln.nomeNormalizado,
          conta.nomeNormalizado
        );
        if (sc > melhorScoreLoja) {
          melhorScoreLoja = sc;
          melhorLoja = ln.loja;
        }
      }

      if (melhorScoreLoja >= config.limiarSugerida) {
        paresCandidatos.push({
          forn,
          conta,
          score: melhorScoreLoja,
          lojaMatch: melhorLoja,
        });
      }
    }
  }

  // Ordena da maior pontuação para a menor (e menor diferença de saldo como desempate)
  paresCandidatos.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.005) return b.score - a.score;
    const diffA = Math.abs(
      a.forn.saldoExibicao - obterSaldoContaNaAba(a.conta, aba)
    );
    const diffB = Math.abs(
      b.forn.saldoExibicao - obterSaldoContaNaAba(b.conta, aba)
    );
    return diffA - diffB;
  });

  for (const par of paresCandidatos) {
    if (
      fornecedoresCasados.has(par.forn.chave) ||
      contasUsadas.has(par.conta.conta)
    ) {
      continue;
    }

    const ov =
      overrides[`${aba}:${par.forn.chave}`] ||
      overrides[`${aba}:NOME:${par.forn.nomeNormalizado}`];
    if (ov?.rejeitadoSugestao) {
      continue;
    }

    const isAproximada = par.score >= config.limiarAproximada;
    const confianca = Math.round(par.score * 100);
    const confirmado = isAproximada || Boolean(ov?.confirmadoSugestao);

    contasUsadas.add(par.conta.conta);
    fornecedoresCasados.add(par.forn.chave);
    matchesPorFornecedor.set(par.forn.chave, {
      contas: [par.conta],
      tipo: isAproximada ? 'Aproximada' : 'Sugerida',
      confianca,
      exigeConfirmacao: !isAproximada,
      confirmadoUsuario: confirmado,
      lojaMatch: par.lojaMatch,
    });
  }

  // =========================================================================
  // PASSO 5: Sugestão por valor (saldo consolidado igual ±0,01 a conta sem correspondência)
  // =========================================================================
  const tolValor = Math.max(0.01, config.tolerancia);
  for (const forn of gruposFornecedor.values()) {
    if (
      fornecedoresCasados.has(forn.chave) ||
      Math.abs(forn.saldoExibicao) <= tolValor
    ) {
      continue;
    }

    const ov =
      overrides[`${aba}:${forn.chave}`] ||
      overrides[`${aba}:NOME:${forn.nomeNormalizado}`];
    if (ov?.rejeitadoSugestao) continue;

    const contaMesmoValor = contasEscopoPadrao.find((c) => {
      if (contasUsadas.has(c.conta)) return false;
      const saldoC = obterSaldoContaNaAba(c, aba);
      return Math.abs(forn.saldoExibicao - saldoC) <= tolValor;
    });

    if (contaMesmoValor) {
      contasUsadas.add(contaMesmoValor.conta);
      fornecedoresCasados.add(forn.chave);
      matchesPorFornecedor.set(forn.chave, {
        contas: [contaMesmoValor],
        tipo: 'Por valor',
        confianca: 80,
        exigeConfirmacao: true,
        confirmadoUsuario: Boolean(ov?.confirmadoSugestao),
        lojaMatch: identificarLojaDoMatch(forn, [contaMesmoValor]),
      });
    }
  }

  // =========================================================================
  // PASSO 6: Escopo Ampliado (Fallback nas demais contas elegíveis da mesma natureza)
  // =========================================================================
  for (const forn of gruposFornecedor.values()) {
    if (fornecedoresCasados.has(forn.chave)) continue;
    const lojasNomes = obterLojasNomesDoGrupo(forn);
    if (lojasNomes.length === 0) continue;

    const ov =
      overrides[`${aba}:${forn.chave}`] ||
      overrides[`${aba}:NOME:${forn.nomeNormalizado}`];
    if (ov?.rejeitadoSugestao) continue;

    let melhorConta: ContaBalancete | null = null;
    let melhorScore = 0;
    let melhorLoja = lojasNomes[0].loja;

    for (const conta of contasForaEscopo) {
      if (contasUsadas.has(conta.conta) || !conta.nomeNormalizado) continue;

      for (const ln of lojasNomes) {
        if (conta.nomeNormalizado === ln.nomeNormalizado) {
          melhorConta = conta;
          melhorScore = 1.0;
          melhorLoja = ln.loja;
          break;
        }
        if (isNomeTruncado(ln.nomeNormalizado, conta.nomeNormalizado)) {
          if (0.95 > melhorScore) {
            melhorScore = 0.95;
            melhorConta = conta;
            melhorLoja = ln.loja;
          }
          continue;
        }
        const sim = calcularSimilaridadeNomes(
          ln.nomeNormalizado,
          conta.nomeNormalizado
        );
        if (sim >= Math.max(0.82, config.limiarSugerida) && sim > melhorScore) {
          melhorScore = sim;
          melhorConta = conta;
          melhorLoja = ln.loja;
        }
      }
      if (melhorScore === 1.0) break;
    }

    if (melhorConta) {
      contasUsadas.add(melhorConta.conta);
      fornecedoresCasados.add(forn.chave);
      matchesPorFornecedor.set(forn.chave, {
        contas: [melhorConta],
        tipo: 'Ampliada',
        confianca: Math.round(melhorScore * 100),
        exigeConfirmacao: true,
        confirmadoUsuario: Boolean(ov?.confirmadoSugestao),
        lojaMatch: melhorLoja,
      });
    }
  }

  // =========================================================================
  // Pré-cálculo de totais para grupos N:M (muitos-para-muitos)
  // =========================================================================
  const totaisPorGrupo = new Map<
    string,
    {
      saldoRel: number;
      saldoBal: number;
      conferencia: number;
      firstKey: string;
    }
  >();

  for (const [chaveForn, match] of matchesPorFornecedor.entries()) {
    if (!match.grupoId || !match.grupoFornecedoresKeys) continue;
    if (totaisPorGrupo.has(match.grupoId)) continue;

    const saldoRelGrupo = round2(
      match.grupoFornecedoresKeys.reduce((acc, k) => {
        const f = gruposFornecedor.get(k);
        return acc + (f ? f.saldoExibicao : 0);
      }, 0)
    );
    const saldoBalGrupo = round2(
      match.contas.reduce((acc, c) => acc + obterSaldoContaNaAba(c, aba), 0)
    );
    totaisPorGrupo.set(match.grupoId, {
      saldoRel: saldoRelGrupo,
      saldoBal: saldoBalGrupo,
      conferencia: round2(saldoRelGrupo - saldoBalGrupo),
      firstKey: match.grupoFornecedoresKeys[0] || chaveForn,
    });
  }

  // =========================================================================
  // Construção das linhas de conciliação dos fornecedores do relatório
  // =========================================================================
  const linhas: LinhaConciliacao[] = [];

  for (const forn of gruposFornecedor.values()) {
    const match = matchesPorFornecedor.get(forn.chave);
    const contasVinculadas = match ? match.contas : [];
    const tipoCorrespondencia: TipoCorrespondencia = match
      ? match.tipo
      : 'Nenhuma';
    const confianca = match ? match.confianca : 0;
    const lojaMatch = match?.lojaMatch;
    const lojasMatchSet = new Set(
      (lojaMatch || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );

    // Monta detalhes por loja (com nome e saldo de cada loja + indicação de qual loja gerou o match com o Balancete)
    const lojasLista: LojaConsolidada[] = Array.from(forn.lojasMap.entries())
      .map(([loja, titulos]) => {
        const saldoBrutoLoja = round2(
          titulos.reduce((acc, t) => acc + t.saldo, 0)
        );
        const infoNomeLoja = forn.nomesPorLoja.get(loja) || {
          nome: titulos[0]?.nome || forn.nome,
          nomeNormalizado: titulos[0]?.nomeNormalizado || forn.nomeNormalizado,
        };
        const isMatchBalancete =
          contasVinculadas.length > 0 && lojasMatchSet.has(loja);

        return {
          loja,
          nomeLoja: infoNomeLoja.nome,
          nomeLojaNormalizado: infoNomeLoja.nomeNormalizado,
          isMatchBalancete,
          qtdTitulos: titulos.length,
          saldoRelatorio: saldoBrutoLoja,
          saldoExibicao:
            aba === 'PA' ? round2(saldoBrutoLoja * -1) : saldoBrutoLoja,
          titulos,
        };
      })
      .sort((a, b) => a.loja.localeCompare(b.loja));

    const lojasTexto = lojasLista.map((l) => l.loja).join(', ');

    // Nomes distintos de todas as lojas do mesmo código (em ordem de loja: 01, 02...)
    const nomesLojasDistintos: string[] = [];
    const nomesNormVistos = new Set<string>();
    for (const l of lojasLista) {
      const chaveNorm = l.nomeLojaNormalizado || l.nomeLoja;
      if (chaveNorm && !nomesNormVistos.has(chaveNorm)) {
        nomesNormVistos.add(chaveNorm);
        nomesLojasDistintos.push(l.nomeLoja);
      }
    }

    // Se o código possui lojas com nomes diferentes (ex: 001760 -> Loja 01 RONALDO / Loja 02 ALAN), mostra todos os nomes!
    const fornecedorNomeConsolidado =
      nomesLojasDistintos.length > 1
        ? nomesLojasDistintos.join(' / ')
        : lojasLista[0]?.nomeLoja || forn.nome;

    const resumoLojasTexto =
      lojasLista.length > 1
        ? lojasLista
            .map(
              (l) =>
                `Loja ${l.loja} (${l.nomeLoja}): R$ ${formatarMoeda(l.saldoExibicao)}${
                  l.isMatchBalancete ? ' [Match Balancete]' : ''
                }`
            )
            .join(' | ')
        : undefined;

    // Saldo do balancete e conferência
    const saldoBalanceteIndividual = round2(
      contasVinculadas.reduce((acc, c) => acc + obterSaldoContaNaAba(c, aba), 0)
    );

    const infoGrupo = match?.grupoId
      ? totaisPorGrupo.get(match.grupoId)
      : undefined;

    const isFirstInGroup = infoGrupo
      ? infoGrupo.firstKey === forn.chave
      : true;

    // Se faz parte de um grupo N:M com múltiplos fornecedores, a conferência é calculada no grupo
    const saldoBalanceteLinha =
      infoGrupo && (match?.grupoFornecedoresKeys?.length || 0) > 1
        ? isFirstInGroup
          ? infoGrupo.saldoBal
          : 0
        : saldoBalanceteIndividual;

    const conferencia =
      infoGrupo && (match?.grupoFornecedoresKeys?.length || 0) > 1
        ? infoGrupo.conferencia
        : round2(forn.saldoExibicao - saldoBalanceteIndividual);

    // Status automático
    let statusAutomatico: StatusConciliacao;
    if (contasVinculadas.length === 0) {
      statusAutomatico = 'Sem conta no balancete';
    } else if (Math.abs(conferencia) <= config.tolerancia) {
      statusAutomatico = 'Saldo OK';
    } else {
      statusAutomatico = 'Divergente';
    }

    // Verifica Overrides do usuário ou Herança do mês anterior
    const ov =
      overrides[`${aba}:${forn.chave}`] ||
      overrides[`${aba}:${forn.codigo}`] ||
      overrides[`${aba}:NOME:${forn.nomeNormalizado}`];

    let herdadoInfo = ov?.herdadoMesAnterior
      ? { ...ov.herdadoMesAnterior }
      : undefined;

    if (herdadoInfo && ov) {
      const saldoAnt = (ov as OverrideUsuario & { _saldoAnteriorRel?: number })
        ._saldoAnteriorRel;
      if (
        saldoAnt !== undefined &&
        Math.abs(saldoAnt - forn.saldoExibicao) > config.tolerancia
      ) {
        herdadoInfo.saldoMudou = true;
      }
    }

    // Se o saldo mudou na herança e ainda não foi confirmado, mantém o motivo herdado apenas como sugestão
    const usarOverrideHerdado =
      !herdadoInfo || (!herdadoInfo.saldoMudou || herdadoInfo.confirmado);

    const statusManual =
      usarOverrideHerdado && ov?.statusManual ? ov.statusManual : undefined;
    const statusFinal = statusManual || statusAutomatico;

    // Motivos sugeridos automaticamente
    const motivosSugeridos = gerarMotivosSugeridos(
      forn,
      contasVinculadas,
      conferencia,
      tipoCorrespondencia,
      config.tolerancia,
      porCodigoMap.get(forn.codigo) || [forn],
      lojasLista
    );

    if (
      herdadoInfo?.saldoMudou &&
      herdadoInfo.motivoHerdado &&
      !herdadoInfo.confirmado
    ) {
      motivosSugeridos.unshift({
        motivo: herdadoInfo.motivoHerdado,
        detalhe: 'Motivo herdado do mês anterior (saldo sofreu alteração neste mês)',
      });
    }

    let motivo = '';
    if (usarOverrideHerdado && ov?.motivo !== undefined) {
      motivo = ov.motivo;
    } else if (statusFinal === 'Saldo OK') {
      motivo = 'Saldo OK';
    }

    const qtdAlertasValorOriginal = forn.todosTitulos.filter(
      (t) => t.alertaValorOriginalDifere
    ).length;

    linhas.push({
      id: `ROW-${aba}-${forn.chave}`,
      aba,
      chaveFornecedor: forn.chave,
      codigo: forn.codigo,
      lojasTexto,
      lojas: lojasLista,
      lojaMatch,
      nomesLojasDistintos,
      resumoLojasTexto,
      fornecedorNome: fornecedorNomeConsolidado,
      fornecedorNomeNormalizado: forn.nomeNormalizado,
      formatoNaoReconhecido: forn.formatoNaoReconhecido,
      qtdTitulos: forn.todosTitulos.length,
      saldoRelatorio: forn.saldoExibicao,
      saldoRelatorioBruto: forn.saldoBruto,
      contasVinculadas,
      contaContabilTexto:
        contasVinculadas.length > 0
          ? contasVinculadas.map((c) => c.conta).join(' + ')
          : '-',
      nomeBalanceteTexto:
        contasVinculadas.length > 0
          ? contasVinculadas.map((c) => c.descricao).join(' / ')
          : '-',
      grupoContabilTexto:
        contasVinculadas.length > 0
          ? contasVinculadas[0].grupoDescricao
          : '-',
      saldoBalancete: saldoBalanceteLinha,
      conferencia,
      tipoCorrespondencia,
      confianca,
      exigeConfirmacao: match ? match.exigeConfirmacao : false,
      confirmadoUsuario: match ? match.confirmadoUsuario : false,
      statusAutomatico,
      statusManual,
      statusFinal,
      motivo,
      motivosSugeridos,
      alertaValorOriginalDifere: qtdAlertasValorOriginal > 0,
      qtdAlertasValorOriginal,
      grupoId: match?.grupoId,
      grupoLabel: match?.grupoLabel,
      grupoFornecedoresKeys: match?.grupoFornecedoresKeys,
      grupoSaldoRelatorioTotal: infoGrupo?.saldoRel,
      grupoSaldoBalanceteTotal: infoGrupo?.saldoBal,
      grupoConferenciaTotal: infoGrupo?.conferencia,
      isFirstInGroup,
      herdadoMesAnterior: herdadoInfo,
    });
  }

  // Ordena as linhas do relatório por nome do fornecedor por padrão
  linhas.sort((a, b) => a.fornecedorNome.localeCompare(b.fornecedorNome, 'pt-BR'));

  // =========================================================================
  // Contas "Somente no balancete" (saldo != 0 no escopo padrão que não existem no relatório)
  // Entram ao final da aba, em destaque
  // =========================================================================
  const linhasSomenteBalancete: LinhaConciliacao[] = [];
  for (const conta of contasEscopoPadrao) {
    if (contasUsadas.has(conta.conta)) continue;
    const saldoConta = obterSaldoContaNaAba(conta, aba);
    if (Math.abs(saldoConta) <= config.tolerancia) continue;

    const chaveBal = `BAL_${conta.conta}`;
    const ov = overrides[`${aba}:${chaveBal}`];
    const statusAutomatico: StatusConciliacao = 'Somente no balancete';
    const statusManual = ov?.statusManual;
    const statusFinal = statusManual || statusAutomatico;
    const conferencia = round2(0 - saldoConta);

    linhasSomenteBalancete.push({
      id: `ROW-${aba}-${chaveBal}`,
      aba,
      chaveFornecedor: chaveBal,
      codigo: '-',
      lojasTexto: '-',
      lojas: [],
      fornecedorNome: '— (Sem títulos em aberto no relatório)',
      fornecedorNomeNormalizado: conta.nomeNormalizado,
      formatoNaoReconhecido: false,
      qtdTitulos: 0,
      saldoRelatorio: 0,
      saldoRelatorioBruto: 0,
      contasVinculadas: [conta],
      contaContabilTexto: conta.conta,
      nomeBalanceteTexto: conta.descricao,
      grupoContabilTexto: conta.grupoDescricao,
      saldoBalancete: saldoConta,
      conferencia,
      tipoCorrespondencia: 'Nenhuma',
      confianca: 0,
      exigeConfirmacao: false,
      confirmadoUsuario: false,
      statusAutomatico,
      statusManual,
      statusFinal,
      motivo: ov?.motivo || '',
      motivosSugeridos: [
        {
          motivo: 'Apropriação duplicada',
          detalhe: 'Saldo contábil sem título correspondente no financeiro',
        },
        {
          motivo: 'Saldo em outra loja/cadastro',
          detalhe: 'Possível baixa no financeiro pendente de contabilização',
        },
      ],
      alertaValorOriginalDifere: false,
      qtdAlertasValorOriginal: 0,
      herdadoMesAnterior: ov?.herdadoMesAnterior,
    });
  }

  linhasSomenteBalancete.sort((a, b) =>
    a.contaContabilTexto.localeCompare(b.contaContabilTexto)
  );

  return [...linhas, ...linhasSomenteBalancete];
}
