import ExcelJS from 'exceljs';
import {
  AbaPrincipal,
  AppConfig,
  DeParaRule,
  LinhaConciliacao,
  StatusConciliacao,
} from '../types/reconciliation';
import { round2 } from './normalization';

const NUM_FMT_BR = '#,##0.00;[Red]-#,##0.00;"-"';
const NAVY_HEADER_BG = 'FF1E293B'; // Azul-marinho escuro sóbrio
const NAVY_SUBHEADER_BG = 'FF334155';
const WHITE_TEXT = 'FFFFFFFF';

function getStatusColors(status: StatusConciliacao): { bg: string; fg: string } {
  if (status === 'Saldo OK') {
    return { bg: 'FFDCFCE7', fg: 'FF166534' }; // Verde
  }
  if (status === 'Ajustado' || status === 'Verificar' || status === 'Pendente') {
    return { bg: 'FFFEF3C7', fg: 'FF92400E' }; // Amarelo / Âmbar
  }
  // Divergente, Sem conta no balancete, Somente no balancete
  return { bg: 'FFFEE2E2', fg: 'FF991B1B' }; // Vermelho
}

function aplicarCabecalhoTopo(
  ws: ExcelJS.Worksheet,
  tituloAba: string,
  config: AppConfig,
  dataGeracao: string,
  ultimaColunaLetra: string,
  instrucaoExtra?: string
) {
  ws.mergeCells(`A1:${ultimaColunaLetra}1`);
  const cellTitulo = ws.getCell('A1');
  cellTitulo.value = `CONCILIAÇÃO DE FORNECEDORES — ${tituloAba.toUpperCase()}`;
  cellTitulo.font = {
    name: 'Calibri',
    size: 13,
    bold: true,
    color: { argb: WHITE_TEXT },
  };
  cellTitulo.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: NAVY_HEADER_BG },
  };
  cellTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${ultimaColunaLetra}2`);
  const cellMeta = ws.getCell('A2');
  const baseMeta = `Empresa: ${config.empresa || 'PRAMAR'}   |   Competência: ${
    config.competencia || '09/2026'
  }   |   Gerado em: ${dataGeracao}   |   Escopo: Exclusivo Contas Analíticas de Fornecedores e Adiantamento a Fornecedores`;
  cellMeta.value = instrucaoExtra ? `${baseMeta}   |   ${instrucaoExtra}` : baseMeta;
  cellMeta.font = {
    name: 'Calibri',
    size: 10,
    italic: true,
    color: { argb: 'FFCBD5E1' },
  };
  cellMeta.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: NAVY_SUBHEADER_BG },
  };
  cellMeta.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 20;

  ws.getRow(3).height = 10;
}

/**
 * Preenche as abas principais (Contas a Pagar e Pagamento Antecipado)
 * com Agrupamento/Estrutura de Tópicos nativa do Excel (Outline Level):
 * - A linha consolidada do Fornecedor (Nível 1) mostra o saldo total (=SUBTOTAL(9, ...))
 * - Clicando no botão [+] ao lado do fornecedor no Excel, expandem-se as operações/títulos individuais
 *   que formaram aquele saldo consolidado!
 */
function preencherAbaPrincipal(
  workbook: ExcelJS.Workbook,
  nomeAba: string,
  aba: AbaPrincipal,
  linhas: LinhaConciliacao[],
  config: AppConfig,
  dataGeracao: string
) {
  const ws = workbook.addWorksheet(nomeAba, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // Configura a estrutura de tópicos (Outline) do Excel para que a linha consolidada fique no topo (summaryBelow = false)
  ws.properties.outlineProperties = {
    summaryBelow: false,
    summaryRight: false,
  };
  ws.properties.outlineLevelRow = 1;

  aplicarCabecalhoTopo(
    ws,
    nomeAba,
    config,
    dataGeracao,
    'M',
    'Dica Excel: Clique no botão [+] à esquerda da linha do fornecedor (ou no nível [2] no topo esquerdo) para abrir as operações que formam o saldo'
  );

  const cabecalhos = [
    'Código / Nº Título',
    'Loja(s)',
    'Fornecedor / Histórico da Operação',
    'Qtd. Títulos',
    'Saldo no Relatório',
    'Conta Analítica',
    'Nome no Balancete',
    'Saldo no Balancete',
    'Conferência (Rel. − Bal.)',
    'Tipo Correspondência',
    'Confiança (%)',
    'Status',
    'Motivo / Justificativa',
  ];

  const headerRow = ws.getRow(4);
  headerRow.values = cabecalhos;
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: WHITE_TEXT },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: NAVY_HEADER_BG },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };
  });

  const startRow = 5;
  let currentRowIdx = startRow;

  for (const linha of linhas) {
    const parentRowIdx = currentRowIdx++;
    const parentRow = ws.getRow(parentRowIdx);

    // Coleta todas as operações (títulos) que compõem o saldo consolidado deste fornecedor
    const operacoes = linha.lojas.flatMap((l) => l.titulos);
    const qtdOperacoes = operacoes.length;
    const firstChildRow = parentRowIdx + 1;
    const lastChildRow = parentRowIdx + qtdOperacoes;

    const motivoComGrupo = linha.grupoLabel
      ? `[${linha.grupoLabel}] ${linha.motivo || ''}`.trim()
      : linha.motivo || '';

    const lojasCellText =
      linha.lojas.length > 1 && linha.lojaMatch
        ? `${linha.lojasTexto} (Match: ${linha.lojaMatch})`
        : linha.lojasTexto;

    const fornecedorCellText =
      linha.lojas.length > 1 && linha.resumoLojasTexto
        ? `${linha.fornecedorNome}  [${linha.resumoLojasTexto}]`
        : linha.fornecedorNome;

    parentRow.getCell(1).value = linha.codigo;
    parentRow.getCell(2).value = lojasCellText;
    parentRow.getCell(3).value = fornecedorCellText;

    // Se tem operações filhas, usa SUBTOTAL(9, ...) para que o saldo consolidado seja a soma dinâmica das operações filhas
    if (qtdOperacoes > 0) {
      parentRow.getCell(4).value = {
        formula: `SUBTOTAL(9,D${firstChildRow}:D${lastChildRow})`,
        result: linha.qtdTitulos,
      };
      parentRow.getCell(5).value = {
        formula: `SUBTOTAL(9,E${firstChildRow}:E${lastChildRow})`,
        result: round2(linha.saldoRelatorio),
      };
    } else {
      parentRow.getCell(4).value = 0;
      parentRow.getCell(5).value = round2(linha.saldoRelatorio);
    }

    parentRow.getCell(6).value = linha.contaContabilTexto;
    parentRow.getCell(7).value = linha.nomeBalanceteTexto;
    parentRow.getCell(8).value = round2(linha.saldoBalancete);
    // FÓRMULA DO EXCEL (=Saldo no relatório - Saldo no balancete)
    parentRow.getCell(9).value = {
      formula: `E${parentRowIdx}-H${parentRowIdx}`,
      result: round2(linha.saldoRelatorio - linha.saldoBalancete),
    };
    parentRow.getCell(10).value = linha.tipoCorrespondencia;
    parentRow.getCell(11).value =
      linha.confianca > 0 ? linha.confianca / 100 : 0;
    parentRow.getCell(12).value = linha.statusFinal;
    parentRow.getCell(13).value = motivoComGrupo;

    parentRow.height = 20;
    parentRow.outlineLevel = 0;

    // Formatação numérica e alinhamentos da linha consolidada
    parentRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    parentRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    parentRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    parentRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    parentRow.getCell(4).numFmt = '#,##0';

    parentRow.getCell(5).numFmt = NUM_FMT_BR;
    parentRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

    parentRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    parentRow.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };

    parentRow.getCell(8).numFmt = NUM_FMT_BR;
    parentRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

    parentRow.getCell(9).numFmt = NUM_FMT_BR;
    parentRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

    parentRow.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    parentRow.getCell(11).numFmt = '0%';
    parentRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };

    parentRow.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    parentRow.getCell(13).alignment = { horizontal: 'left', vertical: 'middle' };

    const statusColors = getStatusColors(linha.statusFinal);
    const isSomenteBal = linha.statusAutomatico === 'Somente no balancete';

    parentRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: qtdOperacoes > 0,
        color: { argb: 'FF0F172A' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (isSomenteBal && colNumber !== 12) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFBEB' },
        };
      }
    });

    const statusCell = parentRow.getCell(12);
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: statusColors.bg },
    };
    statusCell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: statusColors.fg },
    };

    // Insere as linhas analíticas de operações/títulos (outlineLevel = 1, recolhidas por padrão para abrir com 1 clique no [+])
    for (const tit of operacoes) {
      const childIdx = currentRowIdx++;
      const childRow = ws.getRow(childIdx);
      const saldoOpExibicao =
        aba === 'PA' ? round2(tit.saldo * -1) : round2(tit.saldo);

      childRow.getCell(1).value = `↳ [${tit.tp}] ${tit.prfNumeroParcela || 'S/N'}`;
      childRow.getCell(2).value = `Loja ${tit.loja}`;
      childRow.getCell(3).value = `[Loja ${tit.loja} — ${tit.nome}] Emissão: ${
        tit.dataEmissao || '-'
      } | Vencto: ${
        tit.venctoReal || tit.dataVencto || '-'
      } | Vlr. Orig.: R$ ${tit.valorOriginal.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}${
        tit.alertaValorOriginalDifere ? ' (Difere do Saldo)' : ''
      } | Hist.: ${tit.historico || '-'}`;
      childRow.getCell(4).value = 1;
      childRow.getCell(5).value = saldoOpExibicao;
      childRow.getCell(6).value = '';
      childRow.getCell(7).value = `Loja ${tit.loja}: ${tit.nome} (${linha.codigo}-${tit.loja})`;
      childRow.getCell(8).value = null;
      childRow.getCell(9).value = null;
      childRow.getCell(10).value = `Título ${tit.tp}`;
      childRow.getCell(11).value = null;
      childRow.getCell(12).value =
        tit.diasAtraso > 0 ? `Atraso: ${tit.diasAtraso}d` : 'No prazo';
      childRow.getCell(13).value = tit.historico || '';

      childRow.height = 18;
      childRow.outlineLevel = 1;
      childRow.hidden = true; // Recolhido inicialmente: basta clicar no [+] ao lado do fornecedor para expandir!

      childRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      childRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      childRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      childRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
      childRow.getCell(4).numFmt = '#,##0';
      childRow.getCell(5).numFmt = NUM_FMT_BR;
      childRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      childRow.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
      childRow.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };

      childRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 13) return;
        cell.font = {
          name: 'Calibri',
          size: 9,
          italic: colNumber === 7,
          color: { argb: 'FF334155' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
        cell.border = {
          top: { style: ' hair' as ExcelJS.BorderStyle, color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }
  }

  // Linha de Totais com SUBTOTAL(9, ...) e SUM para nunca duplicar as linhas filhas
  const endRow = Math.max(startRow, currentRowIdx - 1);
  const totalRowIdx = currentRowIdx;
  const totalRow = ws.getRow(totalRowIdx);

  const somaQtd = linhas.reduce((a, b) => a + b.qtdTitulos, 0);
  const somaRel = round2(linhas.reduce((a, b) => a + b.saldoRelatorio, 0));
  const somaBal = round2(linhas.reduce((a, b) => a + b.saldoBalancete, 0));

  totalRow.getCell(1).value = 'TOTAL GERAL';
  totalRow.getCell(2).value = '';
  totalRow.getCell(3).value = `${linhas.length} fornecedores/contas analíticas conciliadas`;
  totalRow.getCell(4).value =
    linhas.length > 0
      ? { formula: `SUBTOTAL(9,D${startRow}:D${endRow})`, result: somaQtd }
      : 0;
  totalRow.getCell(5).value =
    linhas.length > 0
      ? { formula: `SUBTOTAL(9,E${startRow}:E${endRow})`, result: somaRel }
      : 0;
  totalRow.getCell(6).value = '';
  totalRow.getCell(7).value = '';
  totalRow.getCell(8).value =
    linhas.length > 0
      ? { formula: `SUM(H${startRow}:H${endRow})`, result: somaBal }
      : 0;
  totalRow.getCell(9).value =
    linhas.length > 0
      ? {
          formula: `E${totalRowIdx}-H${totalRowIdx}`,
          result: round2(somaRel - somaBal),
        }
      : 0;

  totalRow.height = 22;
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > 13) return;
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.border = {
      top: { style: 'double', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  totalRow.getCell(4).numFmt = '#,##0';
  totalRow.getCell(5).numFmt = NUM_FMT_BR;
  totalRow.getCell(8).numFmt = NUM_FMT_BR;
  totalRow.getCell(9).numFmt = NUM_FMT_BR;

  // Filtro automático
  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, endRow), column: 13 },
  };

  // Larguras das colunas ajustadas (colunas numéricas amplas para evitar ######### em milhões)
  ws.columns = [
    { width: 22 }, // Código / Nº Título
    { width: 16 }, // Loja(s) + Match
    { width: 58 }, // Fornecedor / Nomes e Valores por Loja
    { width: 13 }, // Qtd
    { width: 22 }, // Saldo Relatório
    { width: 20 }, // Conta Analítica
    { width: 40 }, // Nome Balancete
    { width: 22 }, // Saldo Balancete
    { width: 24 }, // Conferência
    { width: 18 }, // Tipo Correspondência
    { width: 13 }, // Confiança
    { width: 22 }, // Status
    { width: 42 }, // Motivo
  ];
}

/**
 * Cria a aba "Dinâmica - Composição Saldo" com Drill-Down Hierárquico (Fornecedor -> Loja -> Operações)
 * e a aba "Base Analítica (Dinâmica)" com todas as operações para Tabela Dinâmica do Excel.
 */
function preencherAbasDinamicasComposicao(
  workbook: ExcelJS.Workbook,
  linhasCAP: LinhaConciliacao[],
  linhasPA: LinhaConciliacao[],
  config: AppConfig,
  dataGeracao: string
) {
  // ===========================================================================
  // ABA: Dinâmica - Composição Saldo (Visão interativa de como cada consolidado é formado)
  // ===========================================================================
  const wsDin = workbook.addWorksheet('Dinâmica - Composição Saldo', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  wsDin.properties.outlineProperties = {
    summaryBelow: false,
    summaryRight: false,
  };
  wsDin.properties.outlineLevelRow = 2;

  aplicarCabecalhoTopo(
    wsDin,
    'Dinâmica de Composição do Saldo Consolidado por Fornecedor (Drill-Down de Operações)',
    config,
    dataGeracao,
    'N',
    'Clique no botão [+] ou [-] à esquerda de cada Fornecedor para abrir/fechar as operações que geraram o saldo'
  );

  const hdrDin = wsDin.getRow(4);
  hdrDin.values = [
    'Natureza da Aba',
    'Código Fornecedor',
    'Fornecedor Consolidado / Operação',
    'Loja',
    'Nº Título / Parcela',
    'Tipo (Tp)',
    'Data Emissão',
    'Data Vencimento',
    'Dias Atraso',
    'Valor Original (R$)',
    'Saldo Consolidado / Operação (R$)',
    'Conta Analítica Balancete',
    'Saldo Balancete (R$)',
    'Histórico / Composição da Operação',
  ];
  hdrDin.height = 24;
  hdrDin.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: WHITE_TEXT },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: NAVY_HEADER_BG },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
  });

  const todasLinhasComOperacoes = [
    ...linhasCAP
      .filter((l) => l.qtdTitulos > 0)
      .map((l) => ({
        linha: l,
        nomeGrupo: 'Contas a Pagar (Fornecedores)',
        aba: 'CAP' as AbaPrincipal,
      })),
    ...linhasPA
      .filter((l) => l.qtdTitulos > 0)
      .map((l) => ({
        linha: l,
        nomeGrupo: 'Adiantamento a Fornecedores (PA)',
        aba: 'PA' as AbaPrincipal,
      })),
  ];

  let rIdx = 5;
  const startDinRow = 5;

  for (const { linha, nomeGrupo, aba } of todasLinhasComOperacoes) {
    const fornRowIdx = rIdx++;
    const fornRow = wsDin.getRow(fornRowIdx);

    const operacoes = linha.lojas.flatMap((l) => l.titulos);
    const firstOpRow = fornRowIdx + 1;
    const lastOpRow = fornRowIdx + operacoes.length;

    // Linha Pai Consolidada do Fornecedor (outlineLevel = 0)
    fornRow.getCell(1).value = nomeGrupo;
    fornRow.getCell(2).value = linha.codigo;
    fornRow.getCell(3).value =
      linha.lojas.length > 1 && linha.resumoLojasTexto
        ? `${linha.fornecedorNome} [${linha.resumoLojasTexto}]`
        : `${linha.fornecedorNome} (${linha.qtdTitulos} operação/ões)`;
    fornRow.getCell(4).value =
      linha.lojas.length > 1 && linha.lojaMatch
        ? `Lojas: ${linha.lojasTexto} (Match: ${linha.lojaMatch})`
        : `Lojas: ${linha.lojasTexto}`;
    fornRow.getCell(5).value = `${linha.qtdTitulos} título(s)`;
    fornRow.getCell(6).value = 'CONSOLIDADO';
    fornRow.getCell(7).value = '';
    fornRow.getCell(8).value = '';
    fornRow.getCell(9).value = null;
    fornRow.getCell(10).value = {
      formula: `SUBTOTAL(9,J${firstOpRow}:J${lastOpRow})`,
      result: round2(
        operacoes.reduce(
          (acc, t) => acc + (aba === 'PA' ? Math.abs(t.valorOriginal) : t.valorOriginal),
          0
        )
      ),
    };
    fornRow.getCell(11).value = {
      formula: `SUBTOTAL(9,K${firstOpRow}:K${lastOpRow})`,
      result: round2(linha.saldoRelatorio),
    };
    fornRow.getCell(12).value = linha.contaContabilTexto;
    fornRow.getCell(13).value = round2(linha.saldoBalancete);
    fornRow.getCell(14).value = `Status: ${linha.statusFinal}${
      linha.motivo ? ` — ${linha.motivo}` : ''
    }`;

    fornRow.height = 20;
    fornRow.outlineLevel = 0;

    fornRow.getCell(10).numFmt = NUM_FMT_BR;
    fornRow.getCell(11).numFmt = NUM_FMT_BR;
    fornRow.getCell(13).numFmt = NUM_FMT_BR;

    fornRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > 14) return;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: 'FF0F172A' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    // Linhas Filhas: cada operação individual que compõe o saldo consolidado do fornecedor (outlineLevel = 1)
    for (const tit of operacoes) {
      const opRowIdx = rIdx++;
      const opRow = wsDin.getRow(opRowIdx);
      const saldoOp = aba === 'PA' ? round2(tit.saldo * -1) : round2(tit.saldo);
      const vlrOrigOp =
        aba === 'PA' ? round2(Math.abs(tit.valorOriginal)) : round2(tit.valorOriginal);

      opRow.getCell(1).value = nomeGrupo;
      opRow.getCell(2).value = linha.codigo;
      opRow.getCell(3).value = `   ↳ [Loja ${tit.loja} — ${tit.nome}] Operação: ${
        tit.prfNumeroParcela || 'S/N'
      } (${tit.tp})`;
      opRow.getCell(4).value = tit.loja;
      opRow.getCell(5).value = tit.prfNumeroParcela || '-';
      opRow.getCell(6).value = tit.tp;
      opRow.getCell(7).value = tit.dataEmissao || '-';
      opRow.getCell(8).value = tit.venctoReal || tit.dataVencto || '-';
      opRow.getCell(9).value = tit.diasAtraso;
      opRow.getCell(10).value = vlrOrigOp;
      opRow.getCell(11).value = saldoOp;
      opRow.getCell(12).value = linha.contaContabilTexto;
      opRow.getCell(13).value = null;
      opRow.getCell(14).value = tit.historico || 'Operação registrada no relatório financeiro';

      opRow.height = 18;
      opRow.outlineLevel = 1;
      // Deixamos recolhido para que o usuário veja todos os consolidados e clique no [+] do fornecedor desejado para abrir suas operações
      opRow.hidden = true;

      opRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      opRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      opRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      opRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      opRow.getCell(9).numFmt = '#,##0';
      opRow.getCell(10).numFmt = NUM_FMT_BR;
      opRow.getCell(11).numFmt = NUM_FMT_BR;

      opRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 14) return;
        cell.font = {
          name: 'Calibri',
          size: 9.5,
          color: { argb: 'FF1E293B' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }
  }

  // Linha Total Geral da Dinâmica
  const endDinRow = Math.max(startDinRow, rIdx - 1);
  const totDinRow = wsDin.getRow(rIdx);
  const somaGeralDin = round2(
    todasLinhasComOperacoes.reduce((acc, x) => acc + x.linha.saldoRelatorio, 0)
  );
  totDinRow.getCell(1).value = 'TOTAL GERAL CONSOLIDADO';
  totDinRow.getCell(3).value = `${todasLinhasComOperacoes.length} fornecedores consolidados`;
  totDinRow.getCell(11).value =
    todasLinhasComOperacoes.length > 0
      ? {
          formula: `SUBTOTAL(9,K${startDinRow}:K${endDinRow})`,
          result: somaGeralDin,
        }
      : 0;
  totDinRow.getCell(11).numFmt = NUM_FMT_BR;
  totDinRow.height = 22;
  totDinRow.font = { name: 'Calibri', size: 10, bold: true };

  wsDin.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, endDinRow), column: 14 },
  };

  wsDin.columns = [
    { width: 28 },
    { width: 15 },
    { width: 44 },
    { width: 12 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 18 },
    { width: 22 },
    { width: 20 },
    { width: 18 },
    { width: 42 },
  ];
}

export async function exportarConciliacaoExcel(
  linhasCAP: LinhaConciliacao[],
  linhasPA: LinhaConciliacao[],
  regrasDePara: DeParaRule[],
  config: AppConfig
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Conciliação de Fornecedores';
  workbook.created = new Date();

  const dataGeracao = new Date().toLocaleString('pt-BR');

  // =========================================================================
  // 1. ABA RESUMO (Com Indicadores e Ponte de Conciliação)
  // =========================================================================
  const wsResumo = workbook.addWorksheet('Resumo', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  aplicarCabecalhoTopo(
    wsResumo,
    'Resumo Executivo e Ponte de Conciliação (Exclusivo Contas Analíticas de Fornecedores)',
    config,
    dataGeracao,
    'F'
  );

  const calcStats = (linhas: LinhaConciliacao[]) => {
    const totalRel = round2(linhas.reduce((a, b) => a + b.saldoRelatorio, 0));
    const totalBal = round2(linhas.reduce((a, b) => a + b.saldoBalancete, 0));
    const dif = round2(totalRel - totalBal);
    const qtdOK = linhas.filter(
      (l) => l.statusFinal === 'Saldo OK' || l.statusFinal === 'Ajustado'
    ).length;
    const qtdDiv = linhas.filter(
      (l) =>
        l.statusFinal === 'Divergente' ||
        l.statusFinal === 'Verificar' ||
        l.statusFinal === 'Pendente'
    ).length;
    const qtdSemCorr = linhas.filter(
      (l) =>
        l.statusFinal === 'Sem conta no balancete' ||
        l.statusFinal === 'Somente no balancete'
    ).length;
    const valorConciliado = round2(
      linhas
        .filter(
          (l) => l.statusFinal === 'Saldo OK' || l.statusFinal === 'Ajustado'
        )
        .reduce((a, b) => a + Math.abs(b.saldoRelatorio), 0)
    );
    const valorTotalAbs = round2(
      linhas.reduce((a, b) => a + Math.abs(b.saldoRelatorio), 0)
    );

    return {
      totalRel,
      totalBal,
      dif,
      qtdTotal: linhas.length,
      qtdOK,
      qtdDiv,
      qtdSemCorr,
      pctQtd: linhas.length > 0 ? qtdOK / linhas.length : 0,
      pctValor: valorTotalAbs > 0 ? valorConciliado / valorTotalAbs : 0,
    };
  };

  const statsCAP = calcStats(linhasCAP);
  const statsPA = calcStats(linhasPA);

  const r4 = wsResumo.getRow(4);
  r4.values = [
    'Indicador de Conciliação (Apenas Contas Analíticas)',
    'Fornecedores a Pagar (Passivo)',
    'Adiantamento a Fornecedores (PA)',
    'Total Consolidado (Absoluto)',
    '',
    '',
  ];
  r4.height = 22;
  for (let c = 1; c <= 4; c++) {
    const cell = r4.getCell(c);
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: WHITE_TEXT },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: NAVY_HEADER_BG },
    };
    cell.alignment = {
      horizontal: c === 1 ? 'left' : 'right',
      vertical: 'middle',
    };
  }

  const metricasResumo: Array<{
    label: string;
    cap: number;
    pa: number;
    cons: number;
    fmt: string;
  }> = [
    {
      label: 'Total no Relatório Financeiro (R$)',
      cap: statsCAP.totalRel,
      pa: statsPA.totalRel,
      cons: round2(statsCAP.totalRel + statsPA.totalRel),
      fmt: NUM_FMT_BR,
    },
    {
      label: 'Total no Balancete Contábil — Somente Analíticas (R$)',
      cap: statsCAP.totalBal,
      pa: statsPA.totalBal,
      cons: round2(statsCAP.totalBal + statsPA.totalBal),
      fmt: NUM_FMT_BR,
    },
    {
      label: 'Diferença Líquida (Relatório − Balancete) (R$)',
      cap: statsCAP.dif,
      pa: statsPA.dif,
      cons: round2(statsCAP.dif + statsPA.dif),
      fmt: NUM_FMT_BR,
    },
    {
      label: 'Quantidade Total de Linhas Conciliadas',
      cap: statsCAP.qtdTotal,
      pa: statsPA.qtdTotal,
      cons: statsCAP.qtdTotal + statsPA.qtdTotal,
      fmt: '#,##0',
    },
    {
      label: 'Quantidade Saldo OK / Ajustado',
      cap: statsCAP.qtdOK,
      pa: statsPA.qtdOK,
      cons: statsCAP.qtdOK + statsPA.qtdOK,
      fmt: '#,##0',
    },
    {
      label: 'Quantidade Divergente / Verificar',
      cap: statsCAP.qtdDiv,
      pa: statsPA.qtdDiv,
      cons: statsCAP.qtdDiv + statsPA.qtdDiv,
      fmt: '#,##0',
    },
    {
      label: 'Quantidade Sem Correspondência / Somente Balancete',
      cap: statsCAP.qtdSemCorr,
      pa: statsPA.qtdSemCorr,
      cons: statsCAP.qtdSemCorr + statsPA.qtdSemCorr,
      fmt: '#,##0',
    },
    {
      label: '% Conciliado (Por Quantidade)',
      cap: statsCAP.pctQtd,
      pa: statsPA.pctQtd,
      cons:
        statsCAP.qtdTotal + statsPA.qtdTotal > 0
          ? (statsCAP.qtdOK + statsPA.qtdOK) /
            (statsCAP.qtdTotal + statsPA.qtdTotal)
          : 0,
      fmt: '0.0%',
    },
    {
      label: '% Conciliado (Por Valor)',
      cap: statsCAP.pctValor,
      pa: statsPA.pctValor,
      cons: (statsCAP.pctValor + statsPA.pctValor) / 2,
      fmt: '0.0%',
    },
  ];

  metricasResumo.forEach((m, i) => {
    const row = wsResumo.getRow(5 + i);
    row.getCell(1).value = m.label;
    row.getCell(2).value = m.cap;
    row.getCell(3).value = m.pa;
    row.getCell(4).value = m.cons;
    row.height = 19;
    row.getCell(1).font = { name: 'Calibri', size: 10, bold: i === 2 };
    for (let c = 2; c <= 4; c++) {
      row.getCell(c).numFmt = m.fmt;
      row.getCell(c).font = { name: 'Calibri', size: 10, bold: i === 2 };
    }
    for (let c = 1; c <= 4; c++) {
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    }
  });

  // Ponte de Conciliação na aba Resumo
  let currentRow = 16;
  const escreverPonte = (tituloPonte: string, linhasAba: LinhaConciliacao[]) => {
    const hdrRow = wsResumo.getRow(currentRow++);
    hdrRow.getCell(1).value = tituloPonte;
    hdrRow.getCell(2).value = 'Qtd. Casos';
    hdrRow.getCell(3).value = 'Impacto (Rel. − Bal.)';
    hdrRow.getCell(4).value = 'Ajuste p/ Fechamento (−/+)';
    hdrRow.height = 22;
    for (let c = 1; c <= 4; c++) {
      hdrRow.getCell(c).font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: WHITE_TEXT },
      };
      hdrRow.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: NAVY_HEADER_BG },
      };
    }

    const totalRel = round2(linhasAba.reduce((a, b) => a + b.saldoRelatorio, 0));
    const totalBal = round2(linhasAba.reduce((a, b) => a + b.saldoBalancete, 0));

    const rIni = wsResumo.getRow(currentRow++);
    rIni.getCell(1).value = '(=) Saldo Total no Relatório Financeiro';
    rIni.getCell(2).value = linhasAba.filter((l) => l.qtdTitulos > 0).length;
    rIni.getCell(3).value = totalRel;
    rIni.getCell(4).value = totalRel;
    rIni.getCell(3).numFmt = NUM_FMT_BR;
    rIni.getCell(4).numFmt = NUM_FMT_BR;
    rIni.font = { name: 'Calibri', size: 10, bold: true };

    const porMotivo = new Map<string, { qtd: number; somaDiff: number }>();
    for (const l of linhasAba) {
      if (Math.abs(l.conferencia) <= config.tolerancia) continue;
      const chaveMotivo =
        l.motivo.trim() || `Sem motivo informado (${l.statusFinal})`;
      const atual = porMotivo.get(chaveMotivo) || { qtd: 0, somaDiff: 0 };
      atual.qtd += 1;
      atual.somaDiff = round2(atual.somaDiff + l.conferencia);
      porMotivo.set(chaveMotivo, atual);
    }

    const motivosOrdenados = Array.from(porMotivo.entries()).sort(
      (a, b) => Math.abs(b[1].somaDiff) - Math.abs(a[1].somaDiff)
    );

    for (const [mot, dados] of motivosOrdenados) {
      const rMot = wsResumo.getRow(currentRow++);
      rMot.getCell(1).value = `(+/−) ${mot}`;
      rMot.getCell(2).value = dados.qtd;
      rMot.getCell(3).value = dados.somaDiff;
      rMot.getCell(4).value = round2(-dados.somaDiff);
      rMot.getCell(2).numFmt = '#,##0';
      rMot.getCell(3).numFmt = NUM_FMT_BR;
      rMot.getCell(4).numFmt = NUM_FMT_BR;
    }

    const rBal = wsResumo.getRow(currentRow++);
    rBal.getCell(1).value =
      '(=) Saldo Total no Balancete (Somente Contas Analíticas)';
    rBal.getCell(2).value = linhasAba.filter(
      (l) => l.contasVinculadas.length > 0
    ).length;
    rBal.getCell(3).value = totalBal;
    rBal.getCell(4).value = totalBal;
    rBal.getCell(3).numFmt = NUM_FMT_BR;
    rBal.getCell(4).numFmt = NUM_FMT_BR;
    rBal.font = { name: 'Calibri', size: 10, bold: true };

    const somaDiffs = round2(
      motivosOrdenados.reduce((acc, [, d]) => acc + d.somaDiff, 0)
    );
    const provaZero = round2(totalRel - somaDiffs - totalBal);

    const rProva = wsResumo.getRow(currentRow++);
    rProva.getCell(1).value =
      '(=) Prova Real de Fechamento (Relatório − Diferenças − Balancete)';
    rProva.getCell(2).value = '';
    rProva.getCell(3).value = provaZero;
    rProva.getCell(4).value = provaZero;
    rProva.getCell(3).numFmt = NUM_FMT_BR;
    rProva.getCell(4).numFmt = NUM_FMT_BR;
    rProva.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FF166534' },
    };

    currentRow += 2;
  };

  escreverPonte('PONTE DE CONCILIAÇÃO — CONTAS A PAGAR (FORNECEDORES)', linhasCAP);
  escreverPonte(
    'PONTE DE CONCILIAÇÃO — PAGAMENTO ANTECIPADO (ADIANT. A FORNECEDORES)',
    linhasPA
  );

  wsResumo.columns = [
    { width: 54 },
    { width: 28 },
    { width: 28 },
    { width: 28 },
    { width: 15 },
    { width: 15 },
  ];

  // =========================================================================
  // 2. ABA CONTAS A PAGAR (Com expansão [+] de operações por fornecedor)
  // =========================================================================
  preencherAbaPrincipal(
    workbook,
    'Contas a Pagar',
    'CAP',
    linhasCAP,
    config,
    dataGeracao
  );

  // =========================================================================
  // 3. ABA PAGAMENTO ANTECIPADO (Com expansão [+] de operações por fornecedor)
  // =========================================================================
  preencherAbaPrincipal(
    workbook,
    'Pagamento Antecipado',
    'PA',
    linhasPA,
    config,
    dataGeracao
  );

  // =========================================================================
  // 4. ABA DINÂMICA - COMPOSIÇÃO DE SALDO (Drill-Down de Operações por Fornecedor)
  // =========================================================================
  preencherAbasDinamicasComposicao(
    workbook,
    linhasCAP,
    linhasPA,
    config,
    dataGeracao
  );

  // =========================================================================
  // 5. ABA SOMENTE BALANCETE (Exclusivo Contas Analíticas sem títulos no relatório)
  // =========================================================================
  const wsSomenteBal = workbook.addWorksheet('Somente Balancete', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  aplicarCabecalhoTopo(
    wsSomenteBal,
    'Contas Analíticas Somente no Balancete (Sem Títulos no Relatório)',
    config,
    dataGeracao,
    'F'
  );

  const hdrSB = wsSomenteBal.getRow(4);
  hdrSB.values = [
    'Aba de Origem',
    'Conta Analítica',
    'Nome do Fornecedor no Balancete',
    'Saldo no Balancete',
    'Status',
    'Motivo / Justificativa',
  ];
  hdrSB.height = 24;
  hdrSB.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: WHITE_TEXT },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: NAVY_HEADER_BG },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const somenteBalRows = [
    ...linhasCAP
      .filter((l) => l.statusAutomatico === 'Somente no balancete')
      .map((l) => ({ ...l, origemNome: 'Contas a Pagar' })),
    ...linhasPA
      .filter((l) => l.statusAutomatico === 'Somente no balancete')
      .map((l) => ({ ...l, origemNome: 'Pagamento Antecipado' })),
  ];

  somenteBalRows.forEach((item, idx) => {
    const r = wsSomenteBal.getRow(5 + idx);
    r.getCell(1).value = item.origemNome;
    r.getCell(2).value = item.contaContabilTexto;
    r.getCell(3).value = item.nomeBalanceteTexto;
    r.getCell(4).value = round2(item.saldoBalancete);
    r.getCell(5).value = item.statusFinal;
    r.getCell(6).value = item.motivo;
    r.getCell(4).numFmt = NUM_FMT_BR;
    r.height = 19;
  });

  wsSomenteBal.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, 4 + somenteBalRows.length), column: 6 },
  };
  wsSomenteBal.columns = [
    { width: 22 },
    { width: 22 },
    { width: 44 },
    { width: 20 },
    { width: 22 },
    { width: 42 },
  ];

  // =========================================================================
  // 6. ABA DE-PARA
  // =========================================================================
  const wsDePara = workbook.addWorksheet('De-Para', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  aplicarCabecalhoTopo(
    wsDePara,
    'Vínculos Manuais Salvos (De-Para)',
    config,
    dataGeracao,
    'F'
  );

  const hdrDP = wsDePara.getRow(4);
  hdrDP.values = [
    'Aba',
    'Código(s) Fornecedor',
    'Nome(s) no Relatório',
    'Conta(s) Analítica(s)',
    'Descrição no Balancete',
    'Atualizado em',
  ];
  hdrDP.height = 24;
  hdrDP.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: WHITE_TEXT },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: NAVY_HEADER_BG },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  regrasDePara.forEach((regra, idx) => {
    const r = wsDePara.getRow(5 + idx);
    r.getCell(1).value =
      regra.aba === 'CAP' ? 'Contas a Pagar' : 'Pagamento Antecipado';
    r.getCell(2).value = regra.fornecedorKeys.join(' + ');
    r.getCell(3).value = regra.fornecedorNomes.join(' / ');
    r.getCell(4).value = regra.contasCodigos.join(' + ');
    r.getCell(5).value = regra.contasDescricoes.join(' / ');
    r.getCell(6).value = new Date(regra.updatedAt).toLocaleString('pt-BR');
    r.height = 19;
  });

  wsDePara.columns = [
    { width: 22 },
    { width: 22 },
    { width: 40 },
    { width: 24 },
    { width: 40 },
    { width: 22 },
  ];

  // Gera o arquivo e dispara download no navegador
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const empresaLimpa = (config.empresa || 'EMPRESA')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toUpperCase();
  const compLimpa = (config.competencia || '092026').replace(/[^0-9]/g, '');
  const nomeArquivo = `Conciliacao_Fornecedores_${empresaLimpa}_${compLimpa}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
