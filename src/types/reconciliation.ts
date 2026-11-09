export type AbaPrincipal = 'CAP' | 'PA';
export type ActiveTab = 'RESUMO' | 'CAP' | 'PA' | 'DE_PARA' | 'CONFIG';

export type TipoCorrespondencia =
  | 'Manual'
  | 'Exata'
  | 'Truncada'
  | 'Aproximada'
  | 'Sugerida'
  | 'Por valor'
  | 'Ampliada'
  | 'Nenhuma';

export type StatusConciliacao =
  | 'Saldo OK'
  | 'Divergente'
  | 'Sem conta no balancete'
  | 'Somente no balancete'
  | 'Ajustado'
  | 'Verificar'
  | 'Pendente';

export interface TituloPagar {
  id: string;
  linhaPlanilha: number;
  rawFornecedor: string;
  codigo: string;
  loja: string;
  nome: string;
  nomeNormalizado: string;
  formatoNaoReconhecido: boolean;
  prfNumeroParcela: string;
  tp: string;
  natureza: string;
  dataEmissao: string;
  dataVencto: string;
  venctoReal: string;
  valorOriginal: number;
  titVencidosNominal: number;
  titVencidosCorrigido: number;
  titulosAVencerNominal: number;
  saldo: number;
  alertaValorOriginalDifere: boolean;
  portador: string;
  jurosMulta: number;
  diasAtraso: number;
  historico: string;
}

export interface ContaBalancete {
  conta: string;
  descricao: string;
  nomeNormalizado: string;
  saldoAnterior: number;
  debito: number;
  credito: number;
  saldoAtualTexto: string;
  /** Convenção Passivo: Crédito = positivo (+), Débito = negativo (-) */
  saldoPassivo: number;
  /** Convenção Pagamento Antecipado (Ativo): Débito = positivo (+), Crédito = negativo (-) */
  saldoPA: number;
  isAnalitica: boolean;
  contaPai: string;
  grupoDescricao: string;
}

export interface DivergenciaIntegridade {
  contaSintetica: string;
  descricao: string;
  saldoSintetica: number;
  somaAnaliticas: number;
  diferenca: number;
}

export interface TotaisControleRelatorio {
  nomeArquivo: string;
  totalTitulos: number;
  qtdTitulosPA: number;
  qtdTitulosNaoPA: number;
  saldoTotalPA: number;
  saldoTotalNaoPA: number;
  alertasValorOriginal: number;
  formatosNaoReconhecidos: number;
  qtdIgnoradosExcluidos: number;
}

export interface TotaisControleBalancete {
  nomeArquivo: string;
  totalLinhasLidas: number;
  totalContasAnaliticas: number;
  totalContasSinteticas: number;
  qtdContasExcluidasEscopo: number;
  divergenciasIntegridade: DivergenciaIntegridade[];
}

export interface DeParaRule {
  id: string;
  aba: AbaPrincipal;
  /** Chave primária ou lista de chaves de fornecedores (suporta N:M) */
  fornecedorKeys: string[];
  fornecedorNomes: string[];
  /** Lista de códigos de contas contábeis do balancete vinculadas (suporta N:M) */
  contasCodigos: string[];
  contasDescricoes: string[];
  observacao?: string;
  updatedAt: string;
}

export interface OverrideUsuario {
  chaveLinha: string;
  aba: AbaPrincipal;
  statusManual?: StatusConciliacao;
  motivo?: string;
  confirmadoSugestao?: boolean;
  rejeitadoSugestao?: boolean;
  herdadoMesAnterior?: {
    statusHerdado?: StatusConciliacao;
    motivoHerdado?: string;
    saldoMudou: boolean;
    confirmado: boolean;
  };
}

export interface LojaConsolidada {
  loja: string;
  nomeLoja: string;
  nomeLojaNormalizado: string;
  isMatchBalancete?: boolean;
  qtdTitulos: number;
  saldoRelatorio: number;
  saldoExibicao: number;
  titulos: TituloPagar[];
}

export interface MotivoSugerido {
  motivo: string;
  detalhe: string;
}

export interface LinhaConciliacao {
  id: string;
  aba: AbaPrincipal;
  chaveFornecedor: string; // codigo (ou codigo-loja se separado) ou 'BAL_' + conta
  codigo: string;
  lojasTexto: string;
  lojas: LojaConsolidada[];
  lojaMatch?: string;
  nomesLojasDistintos?: string[];
  resumoLojasTexto?: string;
  fornecedorNome: string;
  fornecedorNomeNormalizado: string;
  formatoNaoReconhecido: boolean;
  qtdTitulos: number;
  /** Na aba PA, o saldo já vem positivado (relatório * -1) para exibição e conferência */
  saldoRelatorio: number;
  saldoRelatorioBruto: number;
  contasVinculadas: ContaBalancete[];
  contaContabilTexto: string;
  nomeBalanceteTexto: string;
  grupoContabilTexto: string;
  saldoBalancete: number;
  /** Conferência = Saldo no relatório - Saldo no balancete (ou do grupo N:M) */
  conferencia: number;
  tipoCorrespondencia: TipoCorrespondencia;
  confianca: number; // 0 a 100
  exigeConfirmacao: boolean;
  confirmadoUsuario: boolean;
  statusAutomatico: StatusConciliacao;
  statusManual?: StatusConciliacao;
  statusFinal: StatusConciliacao;
  motivo: string;
  motivosSugeridos: MotivoSugerido[];
  alertaValorOriginalDifere: boolean;
  qtdAlertasValorOriginal: number;
  /** Informações de Grupo N:M quando múltiplos códigos do relatório se ligam a uma/várias contas */
  grupoId?: string;
  grupoLabel?: string;
  grupoFornecedoresKeys?: string[];
  grupoSaldoRelatorioTotal?: number;
  grupoSaldoBalanceteTotal?: number;
  grupoConferenciaTotal?: number;
  isFirstInGroup?: boolean;
  /** Herança do mês anterior */
  herdadoMesAnterior?: {
    statusHerdado?: StatusConciliacao;
    motivoHerdado?: string;
    saldoMudou: boolean;
    confirmado: boolean;
  };
}

export interface AppConfig {
  empresa: string;
  competencia: string; // MM/AAAA
  tolerancia: number;
  separarPorLoja: boolean;
  limiarAproximada: number;
  limiarSugerida: number;
  prefixosCAP: string[];
  prefixosPA: string[];
}

export const DEFAULT_CONFIG: AppConfig = {
  empresa: 'PRAMAR',
  competencia: '09/2026',
  tolerancia: 0.01,
  separarPorLoja: false,
  limiarAproximada: 0.90,
  limiarSugerida: 0.75,
  prefixosCAP: ['2.1.0.10', '2.2.0.10.2'],
  prefixosPA: ['1.1.0.60.1', '1.1.0.60.2', '1.1.0.60.7'],
};

export const MOTIVOS_PADRAO: string[] = [
  'Saldo OK',
  'NDF (Nota de Débito de Fornecedor)',
  'Apropriação duplicada',
  'Pendente de apropriação da nota nº ___',
  'Retenção na nota fiscal de fornecedor',
  'Juros, multa ou desconto comercial',
  'Saldo antigo vencido',
  'Nota de remessa / devolução',
  'Nome divergente (indicar o nome no balancete)',
  'Saldo em outra loja/cadastro',
  'Relatório com valor original do título',
  'Compensação pendente entre PA e Fornecedor',
];
