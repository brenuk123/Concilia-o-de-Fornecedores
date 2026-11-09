import * as XLSX from 'xlsx';
import {
  ContaBalancete,
  DeParaRule,
  DivergenciaIntegridade,
  OverrideUsuario,
  StatusConciliacao,
  TituloPagar,
  TotaisControleBalancete,
  TotaisControleRelatorio,
} from '../types/reconciliation';
import {
  contaEhFilhaDe,
  extrairFornecedor,
  isContaBalanceteExcluidaEscopo,
  isContaSinteticaPorEstrutura,
  isTituloExcluidoEscopo,
  normalizarNome,
  round2,
} from './normalization';

export interface ResultadoParseRelatorio {
  titulos: TituloPagar[];
  controle: TotaisControleRelatorio;
}

export interface ResultadoParseBalancete {
  contasAnaliticas: ContaBalancete[];
  todasContas: ContaBalancete[];
  controle: TotaisControleBalancete;
}

export interface ResultadoHerancaMesAnterior {
  overrides: Record<string, OverrideUsuario>;
  novosDePara: DeParaRule[];
  resumoImportado: {
    qtdLinhasHerdadas: number;
    qtdVinculosManuais: number;
  };
}

/**
 * Converte valor de célula (número ou texto pt-BR/en-US) para float
 */
export function parseNumeroPlanilha(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

  let str = String(val).trim();
  if (!str) return 0;

  // Verifica se há sufixo negativo ou parênteses
  const isNeg = str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'));
  str = str.replace(/[()]/g, '').trim();

  // Formato brasileiro: 1.234.567,89
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const parsed = parseFloat(str.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return isNeg && parsed > 0 ? -parsed : parsed;
}

/**
 * Converte data do Excel (serial ou string) para DD/MM/AAAA
 */
function formatarDataPlanilha(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date && date.y && date.m && date.d) {
      return `${String(date.d).padStart(2, '0')}/${String(date.m).padStart(2, '0')}/${date.y}`;
    }
  }
  if (val instanceof Date) {
    const d = val.getDate();
    const m = val.getMonth() + 1;
    const y = val.getFullYear();
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  return String(val).trim();
}

/**
 * Converte "Saldo atual" do Balancete (ex: "        5.642.534,01 D" ou "120.000,00 C" ou "0,00")
 * Convenção interna para Passivo: Crédito (C) = positivo (+), Débito (D) = negativo (-)
 */
export function parseSaldoBalancete(val: unknown): {
  saldoPassivo: number;
  saldoPA: number;
  textoOriginal: string;
} {
  if (val === null || val === undefined || val === '') {
    return { saldoPassivo: 0, saldoPA: 0, textoOriginal: '0,00' };
  }

  if (typeof val === 'number') {
    const v = round2(val);
    return {
      saldoPassivo: v,
      saldoPA: v === 0 ? 0 : -v,
      textoOriginal: String(val),
    };
  }

  const textoOriginal = String(val).trim();
  if (!textoOriginal) {
    return { saldoPassivo: 0, saldoPA: 0, textoOriginal: '0,00' };
  }

  const matchSufixo = textoOriginal.match(/([DCdc])\s*$/);
  const sufixo = matchSufixo ? matchSufixo[1].toUpperCase() : '';
  const parteNumerica = sufixo
    ? textoOriginal.slice(0, textoOriginal.lastIndexOf(matchSufixo![1])).trim()
    : textoOriginal;

  const valorAbsoluto = Math.abs(parseNumeroPlanilha(parteNumerica));
  if (valorAbsoluto === 0) {
    return { saldoPassivo: 0, saldoPA: 0, textoOriginal };
  }

  // Convenção Passivo: C = positivo, D = negativo
  let saldoPassivo = valorAbsoluto;
  if (sufixo === 'D') {
    saldoPassivo = -valorAbsoluto;
  } else if (sufixo === 'C') {
    saldoPassivo = valorAbsoluto;
  } else if (parteNumerica.startsWith('-')) {
    saldoPassivo = -valorAbsoluto;
  }

  saldoPassivo = round2(saldoPassivo);
  const saldoPA = saldoPassivo === 0 ? 0 : round2(-saldoPassivo);

  return { saldoPassivo, saldoPA, textoOriginal };
}

function normalizarCabecalho(str: unknown): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Faz a leitura do arquivo "Títulos a Pagar" (.xlsx) do TOTVS Protheus
 */
export async function parseRelatorioTitulos(
  file: File,
  onProgress?: (pct: number, msg: string) => void
): Promise<ResultadoParseRelatorio> {
  onProgress?.(10, 'Lendo arquivo de Títulos a Pagar...');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  // Procura aba "2-Titulos a pagar" ou similar
  let sheetName = workbook.SheetNames.find(
    (n) => normalizarCabecalho(n) === normalizarCabecalho('2-Titulos a pagar')
  );
  if (!sheetName) {
    sheetName = workbook.SheetNames.find((n) =>
      normalizarCabecalho(n).includes('titulosapagar')
    );
  }
  if (!sheetName) {
    // Tenta localizar qualquer aba que contenha a célula "Codigo-loja-Nome do Fornecedor"
    for (const candidate of workbook.SheetNames) {
      const ws = workbook.Sheets[candidate];
      const rows = XLSX.utils.sheet_to_json< unknown[] >(ws, { header: 1, defval: '' });
      const found = rows.slice(0, 15).some((r) =>
        Array.isArray(r) &&
        r.some((c) => normalizarCabecalho(c).includes('codigolojanomedofornecedor'))
      );
      if (found) {
        sheetName = candidate;
        break;
      }
    }
  }

  if (!sheetName) {
    throw new Error(
      `Aba "2-Titulos a pagar" não encontrada no arquivo "${file.name}". Abas disponíveis: ${workbook.SheetNames.join(', ')}. Verifique se enviou o relatório correto do TOTVS Protheus.`
    );
  }

  onProgress?.(30, `Processando aba "${sheetName}"...`);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json< unknown[] >(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  // Detecta dinamicamente a linha de cabeçalho procurando "Codigo-loja-Nome do Fornecedor"
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const hasFornecedorCol = row.some((cell) =>
      normalizarCabecalho(cell).includes('codigolojanomedofornecedor')
    );
    if (hasFornecedorCol) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      `Cabeçalho "Codigo-loja-Nome do Fornecedor" não encontrado nas primeiras 25 linhas da aba "${sheetName}".`
    );
  }

  const headerRow = rows[headerRowIndex].map((c) => normalizarCabecalho(c));

  const findColIndex = (patterns: string[]): number => {
    for (const p of patterns) {
      const idx = headerRow.findIndex((h) => h.includes(p));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colFornecedor = findColIndex(['codigolojanomedofornecedor', 'fornecedor']);
  const colPrfNumero = findColIndex(['prfnumeroparcela', 'prfnumero', 'numeroparcela']);
  const colTp = headerRow.findIndex((h) => h === 'tp' || h === 'tipo' || h.startsWith('tp'));
  const colNatureza = findColIndex(['natureza']);
  const colEmissao = findColIndex(['datadeemissao', 'emissao']);
  const colVencto = findColIndex(['datadevencto', 'datavencto']);
  const colVenctoReal = findColIndex(['venctoreal', 'vencimentoreal']);
  const colValorOriginal = findColIndex(['valororiginal', 'vlroriginal']);
  const colVencidosNominal = findColIndex([
    'titvencidosvalornominal',
    'vencidosvalornominal',
  ]);
  const colVencidosCorrigido = findColIndex([
    'titvencidosvalorcorrigido',
    'vencidosvalorcorrigido',
  ]);
  const colAVencerNominal = findColIndex([
    'titulosavencervalornominal',
    'avencervalornominal',
  ]);
  const colPortador = findColIndex(['portador']);
  const colJuros = findColIndex(['vlrjurosoupermanencia', 'juros']);
  const colDiasAtraso = findColIndex(['diasatraso', 'atraso']);
  const colHistorico = findColIndex(['historicovencidosvencer', 'historico']);

  if (colFornecedor === -1 || colTp === -1) {
    throw new Error(
      'Colunas obrigatórias ("Codigo-loja-Nome do Fornecedor" ou "Tp") ausentes na planilha de Títulos a Pagar.'
    );
  }
  if (colVencidosNominal === -1 && colAVencerNominal === -1) {
    throw new Error(
      'Colunas de saldo ("Tit Vencidos Valor nominal" / "Titulos a vencer Valor nominal") não encontradas.'
    );
  }

  const titulos: TituloPagar[] = [];
  let qtdTitulosPA = 0;
  let qtdTitulosNaoPA = 0;
  let saldoTotalPA = 0;
  let saldoTotalNaoPA = 0;
  let alertasValorOriginal = 0;
  let formatosNaoReconhecidos = 0;
  let qtdIgnoradosExcluidos = 0;

  const totalRows = rows.length;

  for (let i = headerRowIndex + 1; i < totalRows; i++) {
    if (i % 500 === 0) {
      onProgress?.(
        30 + Math.round(((i - headerRowIndex) / (totalRows - headerRowIndex)) * 60),
        `Lendo linha ${i} de ${totalRows}...`
      );
    }

    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawFornecedor = String(row[colFornecedor] ?? '').trim();
    const tp = String(row[colTp] ?? '').trim().toUpperCase();
    const prfNumeroParcela = colPrfNumero !== -1 ? String(row[colPrfNumero] ?? '').trim() : '';

    // Ignorar linhas vazias, subtotais e "Total Geral"
    if (!rawFornecedor && !tp) continue;
    const rawNorm = normalizarCabecalho(rawFornecedor);
    if (
      rawNorm.startsWith('total') ||
      rawNorm.startsWith('subtotal') ||
      rawNorm.includes('totalgeral') ||
      rawNorm.includes('totaldofornecedor')
    ) {
      continue;
    }
    // Se não tem tipo de título (Tp) ou é repetição de cabeçalho, ignora
    if (!tp || tp === 'TP' || rawNorm === 'codigolojanomedofornecedor') {
      continue;
    }

    const forn = extrairFornecedor(rawFornecedor);
    const historico = colHistorico !== -1 ? String(row[colHistorico] ?? '').trim() : '';

    // Exclui impostos, bancos, adiantamento de salário/folha e adiantamento de clientes
    if (isTituloExcluidoEscopo(tp, forn.codigo, forn.nome, historico)) {
      qtdIgnoradosExcluidos++;
      continue;
    }

    const valorOriginal = colValorOriginal !== -1 ? round2(parseNumeroPlanilha(row[colValorOriginal])) : 0;
    const titVencidosNominal =
      colVencidosNominal !== -1 ? round2(parseNumeroPlanilha(row[colVencidosNominal])) : 0;
    const titVencidosCorrigido =
      colVencidosCorrigido !== -1 ? round2(parseNumeroPlanilha(row[colVencidosCorrigido])) : 0;
    const titulosAVencerNominal =
      colAVencerNominal !== -1 ? round2(parseNumeroPlanilha(row[colAVencerNominal])) : 0;

    // SALDO DO TÍTULO = "Tit Vencidos Valor nominal" + "Titulos a vencer Valor nominal"
    const saldo = round2(titVencidosNominal + titulosAVencerNominal);

    // Alerta se Valor Original diferir do saldo
    const alertaValorOriginalDifere =
      Math.abs(Math.abs(valorOriginal) - Math.abs(saldo)) > 0.01;

    if (forn.formatoNaoReconhecido) {
      formatosNaoReconhecidos++;
    }
    if (alertaValorOriginalDifere) {
      alertasValorOriginal++;
    }

    const titulo: TituloPagar = {
      id: `TIT-${i}-${forn.codigo}-${forn.loja}`,
      linhaPlanilha: i + 1,
      rawFornecedor,
      codigo: forn.codigo,
      loja: forn.loja,
      nome: forn.nome,
      nomeNormalizado: normalizarNome(forn.nome),
      formatoNaoReconhecido: forn.formatoNaoReconhecido,
      prfNumeroParcela,
      tp,
      natureza: colNatureza !== -1 ? String(row[colNatureza] ?? '').trim() : '',
      dataEmissao: colEmissao !== -1 ? formatarDataPlanilha(row[colEmissao]) : '',
      dataVencto: colVencto !== -1 ? formatarDataPlanilha(row[colVencto]) : '',
      venctoReal: colVenctoReal !== -1 ? formatarDataPlanilha(row[colVenctoReal]) : '',
      valorOriginal,
      titVencidosNominal,
      titVencidosCorrigido,
      titulosAVencerNominal,
      saldo,
      alertaValorOriginalDifere,
      portador: colPortador !== -1 ? String(row[colPortador] ?? '').trim() : '',
      jurosMulta: colJuros !== -1 ? round2(parseNumeroPlanilha(row[colJuros])) : 0,
      diasAtraso: colDiasAtraso !== -1 ? Math.round(parseNumeroPlanilha(row[colDiasAtraso])) : 0,
      historico,
    };

    titulos.push(titulo);

    if (tp === 'PA') {
      qtdTitulosPA++;
      saldoTotalPA = round2(saldoTotalPA + saldo);
    } else {
      qtdTitulosNaoPA++;
      saldoTotalNaoPA = round2(saldoTotalNaoPA + saldo);
    }
  }

  onProgress?.(100, 'Leitura de Títulos a Pagar concluída.');

  return {
    titulos,
    controle: {
      nomeArquivo: file.name,
      totalTitulos: titulos.length,
      qtdTitulosPA,
      qtdTitulosNaoPA,
      saldoTotalPA,
      saldoTotalNaoPA,
      alertasValorOriginal,
      formatosNaoReconhecidos,
      qtdIgnoradosExcluidos,
    },
  };
}

/**
 * Faz a leitura do arquivo "Balancete de Verificação" (.xlsx)
 */
export async function parseBalancete(
  file: File,
  onProgress?: (pct: number, msg: string) => void
): Promise<ResultadoParseBalancete> {
  onProgress?.(15, 'Lendo arquivo do Balancete de Verificação...');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`Nenhuma aba encontrada no arquivo "${file.name}".`);
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json< unknown[] >(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  // Localiza linha de cabeçalho procurando "Conta" e ("Descricao" ou "Saldo atual")
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const normCols = row.map((c) => normalizarCabecalho(c));
    const hasConta = normCols.some((c) => c === 'conta' || c.includes('contacontabil') || c.includes('classificacao'));
    const hasDesc = normCols.some((c) => c.includes('descricao') || c.includes('titulo'));
    if (hasConta && hasDesc) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      `Cabeçalho do Balancete (Colunas: Conta | Descricao | Saldo anterior | Debito | Credito | Saldo atual) não encontrado no arquivo "${file.name}".`
    );
  }

  const headerRow = rows[headerRowIndex].map((c) => normalizarCabecalho(c));
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = headerRow.findIndex((h) => h === p || h.includes(p));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colConta = findCol(['conta', 'classificacao']);
  const colDescricao = findCol(['descricao', 'nome']);
  const colSaldoAnt = findCol(['saldoanterior']);
  const colDebito = findCol(['debito']);
  const colCredito = findCol(['credito']);
  const colSaldoAtual = findCol(['saldoatual', 'saldofinal']);

  if (colConta === -1 || colDescricao === -1 || colSaldoAtual === -1) {
    throw new Error(
      'Colunas obrigatórias ("Conta", "Descricao" ou "Saldo atual") não encontradas no Balancete.'
    );
  }

  onProgress?.(45, 'Extraindo estrutura de contas sintéticas e analíticas...');

  const todasContas: ContaBalancete[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const conta = String(row[colConta] ?? '').trim();
    const descricao = String(row[colDescricao] ?? '').trim();

    if (!conta || !/^\d/.test(conta)) continue;

    const { saldoPassivo, saldoPA, textoOriginal } = parseSaldoBalancete(row[colSaldoAtual]);
    const saldoAnterior = colSaldoAnt !== -1 ? parseSaldoBalancete(row[colSaldoAnt]).saldoPassivo : 0;
    const debito = colDebito !== -1 ? round2(parseNumeroPlanilha(row[colDebito])) : 0;
    const credito = colCredito !== -1 ? round2(parseNumeroPlanilha(row[colCredito])) : 0;

    todasContas.push({
      conta,
      descricao,
      nomeNormalizado: normalizarNome(descricao),
      saldoAnterior,
      debito,
      credito,
      saldoAtualTexto: textoOriginal,
      saldoPassivo,
      saldoPA,
      isAnalitica: true, // será calculado abaixo
      contaPai: '',
      grupoDescricao: '',
    });
  }

  // Determina quais contas são analíticas (folhas da árvore: nenhuma outra conta é filha dela e não é grupo sintético)
  // E atribui a conta sintética pai imediata (grupo) apenas como metadado descritivo
  for (let i = 0; i < todasContas.length; i++) {
    const c = todasContas[i];
    let temFilha = false;
    let melhorPai: ContaBalancete | null = null;

    for (let j = 0; j < todasContas.length; j++) {
      if (i === j) continue;
      const outra = todasContas[j];

      if (!temFilha && contaEhFilhaDe(outra.conta, c.conta)) {
        temFilha = true;
      }

      if (contaEhFilhaDe(c.conta, outra.conta)) {
        if (!melhorPai || outra.conta.length > melhorPai.conta.length) {
          melhorPai = outra;
        }
      }
    }

    c.isAnalitica = !isContaSinteticaPorEstrutura(c.conta, c.descricao, temFilha);

    if (melhorPai) {
      c.contaPai = melhorPai.conta;
      c.grupoDescricao = melhorPai.descricao;
    } else if (c.conta.startsWith('1.1.0.60.1')) {
      c.contaPai = '1.1.0.60.1';
      c.grupoDescricao = 'ADIANTAMENTO FORNECEDORES MATERIA PRIMA';
    } else if (c.conta.startsWith('1.1.0.60.2')) {
      c.contaPai = '1.1.0.60.2';
      c.grupoDescricao = 'ADIANTAMENTO FORNECEDORES - EXTRA SUCATA';
    } else if (c.conta.startsWith('1.1.0.60.7')) {
      c.contaPai = '1.1.0.60.7';
      c.grupoDescricao = 'ADIANTAMENTO A FORNECEDORES';
    } else if (c.conta.startsWith('2.1.0.10')) {
      c.contaPai = '2.1.0.10';
      c.grupoDescricao = 'FORNECEDORES';
    } else if (c.conta.startsWith('2.2.0.10.2')) {
      c.contaPai = '2.2.0.10.2';
      c.grupoDescricao = 'FORNECEDORES DE LONGO PRAZO';
    }
  }

  const todasAnaliticasBrutas = todasContas.filter((c) => c.isAnalitica);
  const contasAnaliticas = todasAnaliticasBrutas.filter(
    (c) => !isContaBalanceteExcluidaEscopo(c.conta, c.descricao, c.grupoDescricao)
  );
  const qtdContasExcluidasEscopo =
    todasAnaliticasBrutas.length - contasAnaliticas.length;
  const contasSinteticas = todasContas.filter((c) => !c.isAnalitica);

  onProgress?.(80, 'Validando integridade contábil (sintéticas × analíticas)...');

  // Validação de integridade apenas para os grupos de Fornecedores e Adiantamento a Fornecedores
  const divergenciasIntegridade: DivergenciaIntegridade[] = [];
  for (const sintetica of contasSinteticas) {
    if (
      isContaBalanceteExcluidaEscopo(
        sintetica.conta,
        sintetica.descricao,
        sintetica.grupoDescricao
      )
    ) {
      continue;
    }
    const filhasAnaliticas = todasAnaliticasBrutas.filter((a) =>
      contaEhFilhaDe(a.conta, sintetica.conta)
    );
    if (filhasAnaliticas.length === 0) continue;

    // Ignora conta sintética pai que agrega subgrupos excluídos (como 1.1.0.6 ou 1.1.0.60 que incluem 1.1.0.60.3 de salários)
    const temFilhaExcluida = filhasAnaliticas.some((a) =>
      isContaBalanceteExcluidaEscopo(a.conta, a.descricao, a.grupoDescricao)
    );
    if (temFilhaExcluida) continue;

    // Ignora conta sintética de nível superior (ex: 1.1.0.6) caso o Balancete seja parcial e não traga todos os subgrupos
    const partesSintetica = sintetica.conta.split('.');
    if (partesSintetica.length <= 4 && sintetica.conta.startsWith('1.')) {
      continue;
    }

    const somaAnaliticas = round2(
      filhasAnaliticas.reduce((acc, item) => acc + item.saldoPassivo, 0)
    );
    const diferenca = round2(sintetica.saldoPassivo - somaAnaliticas);
    if (Math.abs(diferenca) > 0.02) {
      divergenciasIntegridade.push({
        contaSintetica: sintetica.conta,
        descricao: sintetica.descricao,
        saldoSintetica: sintetica.saldoPassivo,
        somaAnaliticas,
        diferenca,
      });
    }
  }

  onProgress?.(100, 'Balancete processado com sucesso.');

  return {
    contasAnaliticas,
    todasContas,
    controle: {
      nomeArquivo: file.name,
      totalLinhasLidas: todasContas.length,
      totalContasAnaliticas: contasAnaliticas.length,
      totalContasSinteticas: contasSinteticas.length,
      qtdContasExcluidasEscopo,
      divergenciasIntegridade,
    },
  };
}

/**
 * Importa arquivo Excel de conciliação do mês anterior para herdar Status, Motivo e De-Para
 */
export async function parseArquivoMesAnterior(
  file: File
): Promise<ResultadoHerancaMesAnterior> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const overrides: Record<string, OverrideUsuario> = {};
  const novosDePara: DeParaRule[] = [];
  let qtdLinhasHerdadas = 0;

  const processarAbaConciliacao = (nomeAba: string, aba: 'CAP' | 'PA') => {
    const sheet = workbook.Sheets[nomeAba];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json< unknown[] >(sheet, { header: 1, defval: '' });

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i];
      if (
        Array.isArray(r) &&
        r.some((c) => normalizarCabecalho(c) === 'codigo') &&
        r.some((c) => normalizarCabecalho(c).includes('status'))
      ) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return;

    const header = rows[headerIdx].map((c) => normalizarCabecalho(c));
    const idxCodigo = header.findIndex((h) => h === 'codigo');
    const idxFornecedor = header.findIndex((h) => h.includes('fornecedor'));
    const idxSaldoRel = header.findIndex((h) => h.includes('saldonorelatorio'));
    const idxConta = header.findIndex((h) => h.includes('contacontabil'));
    const idxNomeBal = header.findIndex((h) => h.includes('nomenobalancete'));
    const idxTipo = header.findIndex((h) => h.includes('tipodecorrespondencia'));
    const idxStatus = header.findIndex((h) => h === 'status');
    const idxMotivo = header.findIndex((h) => h === 'motivo');

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const codigo = String(r[idxCodigo] ?? '').trim();
      const fornecedor = String(r[idxFornecedor] ?? '').trim();
      if (!codigo && !fornecedor) continue;
      if (normalizarCabecalho(codigo).includes('total') || normalizarCabecalho(fornecedor).includes('total')) {
        continue;
      }

      const status = String(r[idxStatus] ?? '').trim() as StatusConciliacao;
      const motivo = String(r[idxMotivo] ?? '').trim();
      const contaStr = idxConta !== -1 ? String(r[idxConta] ?? '').trim() : '';
      const nomeBalStr = idxNomeBal !== -1 ? String(r[idxNomeBal] ?? '').trim() : '';
      const tipoStr = idxTipo !== -1 ? String(r[idxTipo] ?? '').trim() : '';
      const saldoAntRel = idxSaldoRel !== -1 ? parseNumeroPlanilha(r[idxSaldoRel]) : 0;

      const chaveCodigo = `${aba}:${codigo}`;
      const chaveNome = `${aba}:NOME:${normalizarNome(fornecedor)}`;

      if (status || motivo) {
        const itemOverride: OverrideUsuario = {
          chaveLinha: codigo,
          aba,
          statusManual: status || undefined,
          motivo: motivo || undefined,
          herdadoMesAnterior: {
            statusHerdado: status || undefined,
            motivoHerdado: motivo || undefined,
            saldoMudou: false, // avaliado na conciliação comparando com saldoAntRel
            confirmado: false,
          },
        };
        // Guardamos metadado auxiliar de saldo anterior
        (itemOverride as OverrideUsuario & { _saldoAnteriorRel?: number })._saldoAnteriorRel = saldoAntRel;
        overrides[chaveCodigo] = itemOverride;
        if (fornecedor) {
          overrides[chaveNome] = { ...itemOverride };
        }
        qtdLinhasHerdadas++;
      }

      if (tipoStr === 'Manual' && contaStr && contaStr !== '-') {
        const contasCodigos = contaStr.split(/[,;+]/).map((s) => s.trim()).filter(Boolean);
        novosDePara.push({
          id: `HERDADO-${aba}-${codigo}-${Date.now()}-${i}`,
          aba,
          fornecedorKeys: [codigo],
          fornecedorNomes: [fornecedor],
          contasCodigos,
          contasDescricoes: [nomeBalStr],
          observacao: 'Herdado do arquivo do mês anterior',
          updatedAt: new Date().toISOString(),
        });
      }
    }
  };

  processarAbaConciliacao('Contas a Pagar', 'CAP');
  processarAbaConciliacao('Pagamento Antecipado', 'PA');

  return {
    overrides,
    novosDePara,
    resumoImportado: {
      qtdLinhasHerdadas,
      qtdVinculosManuais: novosDePara.length,
    },
  };
}
