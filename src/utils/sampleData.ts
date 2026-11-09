import * as XLSX from 'xlsx';
import {
  ResultadoParseBalancete,
  ResultadoParseRelatorio,
  parseBalancete,
  parseRelatorioTitulos,
} from './parsers';

function criarWorkbookRelatorioExemplo(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Linha 1 é apenas um título; cabeçalho real está na linha 2
  const rows: unknown[][] = [
    ['RELATORIO FINANCEIRO TOTVS PROTHEUS - POSICAO DE TITULOS A PAGAR - EMPRESA PRAMAR - COMPETENCIA 09/2026'],
    [
      'Codigo-loja-Nome do Fornecedor',
      'Prf-Numero Parcela',
      'Tp',
      'Natureza',
      'Data de Emissao',
      'Data de Vencto',
      'Vencto Real',
      'Valor Original',
      'Tit Vencidos Valor nominal',
      'Tit Vencidos Valor corrigido',
      'Titulos a vencer Valor nominal',
      'Porta-dor',
      'Vlr.juros ou permanencia',
      'Dias Atraso',
      'Historico(Vencidos+Vencer)',
    ],
    // 1. Nome Exato + Múltiplas Lojas (Saldo OK somando Loja 01 + Loja 02 = 185.400,00)
    [
      '001045-01-GERDAU ACOS LONGOS S/A',
      'NF -00045812 1',
      'NF',
      '20101',
      '05/09/2026',
      '25/09/2026',
      '25/09/2026',
      120400.0,
      0,
      0,
      120400.0,
      '341',
      0,
      0,
      'AQUISICAO MATERIA PRIMA LOTE 09',
    ],
    [
      '001045-02-GERDAU ACOS LONGOS S/A',
      'NF -00045990 1',
      'NF',
      '20101',
      '10/09/2026',
      '10/10/2026',
      '10/10/2026',
      65000.0,
      0,
      0,
      65000.0,
      '341',
      0,
      0,
      'AQUISICAO PERFIS METALICOS FILIAL 02',
    ],
    // 2. Nome Truncado no Balancete (40 chars) + Diferença explicada por NDF negativa
    [
      '002190-01-COMPANHIA BRASILEIRA DE DISTRIBUICAO E LOGISTICA INTEGRADA LTDA',
      'NF -00981120 1',
      'NF',
      '20102',
      '02/09/2026',
      '15/10/2026',
      '15/10/2026',
      94500.0,
      0,
      0,
      94500.0,
      '001',
      0,
      0,
      'SUPRIMENTOS INDUSTRIAIS',
    ],
    [
      '002190-01-COMPANHIA BRASILEIRA DE DISTRIBUICAO E LOGISTICA INTEGRADA LTDA',
      'NDF-00000312 1',
      'NDF',
      '20102',
      '12/09/2026',
      '15/10/2026',
      '15/10/2026',
      -4500.0,
      0,
      0,
      -4500.0,
      '001',
      0,
      0,
      'DEVOLUCAO PARCIAL AVARIA LOTE',
    ],
    // 3. Exceção real de loja com 1 dígito + Pendente de apropriação de nota específica
    [
      '102792-1 -ELETRICA COMERCIAL E INDUSTRIAL SOROCABA LTDA',
      'NF -00018200 1',
      'NF',
      '20105',
      '01/09/2026',
      '05/10/2026',
      '05/10/2026',
      42000.0,
      0,
      0,
      42000.0,
      '237',
      0,
      0,
      'PAINEIS DE COMANDO',
    ],
    [
      '102792-1 -ELETRICA COMERCIAL E INDUSTRIAL SOROCABA LTDA',
      'NF -00018995 1',
      'NF',
      '20105',
      '28/09/2026',
      '28/10/2026',
      '28/10/2026',
      13750.5,
      0,
      0,
      13750.5,
      '237',
      0,
      0,
      'CABOS ALTA TENSAO ENTREGUE 29/09',
    ],
    // 4. Similaridade Aproximada (>= 90%) + Saldo antigo vencido (> 365 dias) + Valor Original difere do saldo
    [
      '003411-01-VOTORANTIM CIMENTOS S.A.',
      'NF -00007721 1',
      'NF',
      '20101',
      '10/03/2025',
      '10/04/2025',
      '10/04/2025',
      50000.0,
      32800.0,
      35100.0,
      0,
      '341',
      2300.0,
      538,
      'SALDO REMANESCENTE EM DISCUSSAO COMERCIAL',
    ],
    // 5. Sugestão por Valor (nomes completamente diferentes: Razão Social vs Nome Fantasia no Balancete)
    [
      '004810-01- Rumo Malha Paulista S/A',
      'FT -00003109 1',
      'FT',
      '20204',
      '15/09/2026',
      '20/10/2026',
      '20/10/2026',
      78320.45,
      0,
      0,
      78320.45,
      '341',
      0,
      0,
      'FRETE FERROVIARIO EXPORTACAO',
    ],
    // 6. Diferença igual ao saldo de outra loja do mesmo código
    [
      '005102-01-WHITE MARTINS GASES INDUSTRIAIS LTDA',
      'NF -00112001 1',
      'NF',
      '20103',
      '08/09/2026',
      '08/10/2026',
      '08/10/2026',
      64000.0,
      0,
      0,
      64000.0,
      '001',
      0,
      0,
      'OXIGENIO E ARGONIO PLANTA MATRIZ',
    ],
    [
      '005102-02-WHITE MARTINS GASES INDUSTRIAIS LTDA',
      'NF -00112450 1',
      'NF',
      '20103',
      '19/09/2026',
      '19/10/2026',
      '19/10/2026',
      19500.0,
      0,
      0,
      19500.0,
      '001',
      0,
      0,
      'CILINDROS PLANTA FILIAL 02',
    ],
    // 7. Fornecedor de Longo Prazo (2.2.0.10.2) — Saldo OK
    [
      '005880-01-ROMI S/A MAQUINAS E EQUIPAMENTOS INDUSTRIAIS',
      'NF -00074120 1',
      'NF',
      '20108',
      '10/09/2026',
      '10/12/2027',
      '10/12/2027',
      320000.0,
      0,
      0,
      320000.0,
      '341',
      0,
      0,
      'CENTRO DE USINAGEM CNC LONGO PRAZO',
    ],
    // 8. Fornecedor no Exterior (2.1.0.10.4) — Saldo OK
    [
      'EX0012-01-THYSSENKRUPP MATERIALS TRADING GMBH',
      'NF -00009912 1',
      'NF',
      '20109',
      '18/09/2026',
      '18/11/2026',
      '18/11/2026',
      215400.0,
      0,
      0,
      215400.0,
      '341',
      0,
      0,
      'IMPORTACAO BOBINAS ESPECIAIS DI 26/149001',
    ],
    // 9. Similaridade Sugerida (entre 0,75 e 0,90)
    [
      '006300-01-SKF DO BRASIL ROLAMENTOS INDUSTRIAIS LTDA',
      'NF -00033410 1',
      'NF',
      '20105',
      '14/09/2026',
      '14/10/2026',
      '14/10/2026',
      88900.0,
      0,
      0,
      88900.0,
      '341',
      0,
      0,
      'MANCAIS E ROLAMENTOS LINHA LAMINACAO',
    ],
    // 10. Sem conta no balancete
    [
      '007890-01-TRANSPORTADORA RAPIDO TRANSPAULO LTDA',
      'FT -00004411 1',
      'FT',
      '20204',
      '29/09/2026',
      '15/10/2026',
      '15/10/2026',
      16420.0,
      0,
      0,
      16420.0,
      '237',
      0,
      0,
      'CTES EMITIDOS FINAL DO MES',
    ],
    // =======================================================================
    // TÍTULOS DE PAGAMENTO ANTECIPADO A FORNECEDORES (Tp = PA, negativos)
    // =======================================================================
    // Caso real: Mesmo Código (001760) com 2 lojas e nomes diferentes (Loja 01: Ronaldo = 5.616,30 + Loja 02: Alan = 36.211,77 -> Total 41.828,07 batendo com a conta 1.1.0.60.101.832)
    [
      '001760-01-RONALDO ANDRADE DE MORAIS',
      'ADT-18072022 1',
      'PA',
      '10601',
      '18/07/2022',
      '18/07/2022',
      '18/07/2022',
      -6576.6,
      0,
      0,
      -5616.3,
      '341',
      0,
      1535,
      'ADIANTAMENTO FORNECEDOR MATERIA PRIMA LOJA 01',
    ],
    [
      '001760-02-ALAN FERNANDO DE MORAIS',
      'ADT-04052026 1',
      'PA',
      '10601',
      '04/05/2026',
      '04/05/2026',
      '04/05/2026',
      -18211.77,
      0,
      0,
      -18211.77,
      '341',
      0,
      149,
      'ADIANTAMENTO FORNECEDOR MATERIA PRIMA LOJA 02 - LOTE A',
    ],
    [
      '001760-02-ALAN FERNANDO DE MORAIS',
      'ADT-22052026 1',
      'PA',
      '10601',
      '22/05/2026',
      '22/05/2026',
      '22/05/2026',
      -18000.0,
      0,
      0,
      -18000.0,
      '341',
      0,
      131,
      'ADIANTAMENTO FORNECEDOR MATERIA PRIMA LOJA 02 - LOTE B',
    ],
    [
      '008100-01-WEG EQUIPAMENTOS ELETRICOS S/A',
      'PA -00001201 1',
      'PA',
      '10601',
      '04/09/2026',
      '04/09/2026',
      '04/09/2026',
      -310000.0,
      0,
      0,
      -310000.0,
      '341',
      0,
      0,
      'SINAL 30% TRANSFORMADOR SUBESTACAO',
    ],
    [
      '008250-01-SIEMENS INFRAESTRUTURA E INDUSTRIA LTDA',
      'PA -00001245 1',
      'PA',
      '10601',
      '11/09/2026',
      '11/09/2026',
      '11/09/2026',
      -175000.0,
      0,
      0,
      -145000.0,
      '001',
      0,
      0,
      'ADIANTAMENTO AUTOMACAO CLP (BAIXA PARCIAL)',
    ],
    [
      '008400-01-SCHNEIDER ELECTRIC BRASIL LTDA',
      'PA -00001288 1',
      'PA',
      '10602',
      '22/09/2026',
      '22/09/2026',
      '22/09/2026',
      -92450.0,
      0,
      0,
      -92450.0,
      '341',
      0,
      0,
      'ADIANTAMENTO IMPORTACAO DISJUNTORES',
    ],
    // Linha de Total Geral que deve ser ignorada pelo parser
    [
      'Total Geral',
      '',
      '',
      '',
      '',
      '',
      '',
      1607740.95,
      32800.0,
      35100.0,
      628040.95,
      '',
      2300.0,
      '',
      '',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '2-Titulos a pagar');
  return wb;
}

function criarWorkbookBalanceteExemplo(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const rows: unknown[][] = [
    ['BALANCETE DE VERIFICACAO CONTABIL - PRAMAR INDUSTRIAL S/A - 01/09/2026 A 30/09/2026'],
    ['Conta', 'Descricao', 'Saldo anterior', 'Debito', 'Credito', 'Saldo atual'],
    // ATIVO - ADIANTAMENTO A FORNECEDORES (1.1.0.6 -> 1.1.0.60.1 / 1.1.0.60.2 / 1.1.0.60.7)
    ['1.1.0.6', 'ADIANTAMENTOS', '461.828,07 D', 162450.0, 0.0, '624.278,07 D'],
    ['1.1.0.60.1', 'ADIANTAMENTO FORNECEDORES MATERIA PRIMA', '391.828,07 D', 125000.0, 0.0, '516.828,07 D'],
    ['1.1.0.60.100.001', 'WEG EQUIPAMENTOS ELETRICOS S/A', '200.000,00 D', 110000.0, 0.0, '310.000,00 D'],
    ['1.1.0.60.100.002', 'SIEMENS INFRAESTRUTURA E INDUSTRIA LTDA', '150.000,00 D', 15000.0, 0.0, '165.000,00 D'],
    ['1.1.0.60.101.832', 'RONALDO ANDRADE DE MORAIS', '41.828,07 D', 0.0, 0.0, '41.828,07 D'],
    ['1.1.0.60.2', 'ADIANTAMENTO FORNECEDORES - EXTRA SUCATA', '70.000,00 D', 37450.0, 0.0, '107.450,00 D'],
    ['1.1.0.60.200.001', 'SCHNEIDER ELECTRIC BRASIL LTDA', '70.000,00 D', 22450.0, 0.0, '92.450,00 D'],
    ['1.1.0.60.200.002', 'ABB AUTOMACAO INDUSTRIAL LTDA', '0,00', 15000.0, 0.0, '15.000,00 D'],

    // PASSIVO CIRCULANTE - FORNECEDORES (2.1.0.10)
    ['2.1.0.10', 'FORNECEDORES NACIONAIS E EXTERIOR', '680.000,00 C', 45000.0, 258370.45, '893.370,45 C'],
    ['2.1.0.10.1', 'FORNECEDORES MATERIA-PRIMA', '250.000,00 C', 15000.0, 82700.0, '317.700,00 C'],
    ['2.1.0.10.1.0001', 'GERDAU ACOS LONGOS SA', '120.000,00 C', 0.0, 65400.0, '185.400,00 C'],
    // Truncado em 40 chars + sem abater a NDF de 4.500 (Saldo Balancete = 94.500,00 C vs Relatório = 90.000,00)
    ['2.1.0.10.1.0002', 'COMPANHIA BRASILEIRA DE DISTRIBUICAO E L', '80.000,00 C', 0.0, 14500.0, '94.500,00 C'],
    // Votorantim (Diferença por saldo antigo / valor original)
    ['2.1.0.10.1.0003', 'VOTORANTIM CIMENTOS SA', '50.000,00 C', 12200.0, 0.0, '37.800,00 C'],

    ['2.1.0.10.2', 'FORNECEDORES PARTES NAO RELACIONADAS', '260.000,00 C', 30000.0, 130270.45, '360.270,45 C'],
    // Eletrica Sorocaba: Balancete tem 42.000,00 C (falta apropriar a NF 00018995 de 13.750,50)
    ['2.1.0.10.2.0001', 'ELETRICA COMERCIAL E INDUSTRIAL SOROCABA', '30.000,00 C', 0.0, 12000.0, '42.000,00 C'],
    // Sugestão por valor (78.320,45 C) com nome antigo de concessão ferroviária no plano de contas
    ['2.1.0.10.2.0002', 'ALL AMERICA LATINA LOGISTICA MALHA PAULI', '50.000,00 C', 0.0, 28320.45, '78.320,45 C'],
    // White Martins: Balancete tem apenas a Loja 01 (64.000,00 C), faltando os 19.500,00 da Loja 02
    ['2.1.0.10.2.0003', 'WHITE MARTINS GASES INDUSTRIAIS LTDA', '60.000,00 C', 0.0, 4000.0, '64.000,00 C'],
    // SKF (Nome com leve variação para acionar similaridade sugerida/aproximada)
    ['2.1.0.10.2.0004', 'SKF DO BRASIL ROLAMENTOS LTDA', '80.000,00 C', 0.0, 8900.0, '88.900,00 C'],
    // Conta SOMENTE NO BALANCETE (sem título no relatório)
    ['2.1.0.10.2.0009', 'USIMINAS SIDERURGICAS DE MINAS GERAIS SA', '87.050,00 C', 0.0, 0.0, '87.050,00 C'],

    ['2.1.0.10.4', 'FORNECEDORES NO EXTERIOR', '170.000,00 C', 0.0, 45400.0, '215.400,00 C'],
    ['2.1.0.10.4.0001', 'THYSSENKRUPP MATERIALS TRADING GMBH', '170.000,00 C', 0.0, 45400.0, '215.400,00 C'],

    // PASSIVO NÃO CIRCULANTE - FORNECEDORES DE LONGO PRAZO (2.2.0.10.2)
    ['2.2.0.10.2', 'FORNECEDORES DE LONGO PRAZO', '320.000,00 C', 0.0, 0.0, '320.000,00 C'],
    ['2.2.0.10.2.0001', 'ROMI SA MAQUINAS E EQUIPAMENTOS INDUSTRI', '320.000,00 C', 0.0, 0.0, '320.000,00 C'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Balancete');
  return wb;
}

export async function carregarDadosDemonstracao(): Promise<{
  relatorio: ResultadoParseRelatorio;
  balancete: ResultadoParseBalancete;
}> {
  const wbRel = criarWorkbookRelatorioExemplo();
  const bufRel = XLSX.write(wbRel, { type: 'array', bookType: 'xlsx' });
  const fileRel = new File([bufRel], 'contas_a_pagar_e_PA_demo.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const wbBal = criarWorkbookBalanceteExemplo();
  const bufBal = XLSX.write(wbBal, { type: 'array', bookType: 'xlsx' });
  const fileBal = new File([bufBal], 'balancete_PRAMAR_092026_demo.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const relatorio = await parseRelatorioTitulos(fileRel);
  const balancete = await parseBalancete(fileBal);

  return { relatorio, balancete };
}

export function baixarPlanilhasExemplo(): void {
  const wbRel = criarWorkbookRelatorioExemplo();
  XLSX.writeFile(wbRel, 'contas_a_pagar_e_PA_exemplo.xlsx');

  const wbBal = criarWorkbookBalanceteExemplo();
  XLSX.writeFile(wbBal, 'balancete_PRAMAR_092026_exemplo.xlsx');
}
