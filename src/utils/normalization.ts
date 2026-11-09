/**
 * Módulo de Normalização, Tratamento de Fornecedor e Similaridade de Nomes
 */

export interface FornecedorExtraido {
  codigo: string;
  loja: string;
  nome: string;
  formatoNaoReconhecido: boolean;
}

// Regex tolerante solicitada: ^\s*(\S+?)\s*-\s*(\d+)\s*-\s*(.+)$
const FORNECEDOR_REGEX = /^\s*(\S+?)\s*-\s*(\d+)\s*-\s*(.+)$/;

/**
 * Separa "Codigo-loja-Nome do Fornecedor" em Código | Loja | Nome.
 * Trata exceções reais como "UNIAO -00-UNIAO", "INPS  -00-Instituto...", "102792-1 -ELETRICA...".
 * Se o regex falhar, mantém o texto inteiro como Nome e marca formatoNaoReconhecido = true.
 */
export function extrairFornecedor(raw: string): FornecedorExtraido {
  const texto = (raw || '').trim();
  if (!texto) {
    return {
      codigo: 'SEM-COD',
      loja: '00',
      nome: '',
      formatoNaoReconhecido: true,
    };
  }

  const match = texto.match(FORNECEDOR_REGEX);
  if (match) {
    return {
      codigo: match[1].trim(),
      loja: match[2].trim(),
      nome: match[3].trim(),
      formatoNaoReconhecido: false,
    };
  }

  // Fallback seguro: nada é descartado
  return {
    codigo: `NR-${ normalizarNome(texto).slice(0, 12).replace(/\s+/g, '_') || 'FORN' }`,
    loja: '--',
    nome: texto,
    formatoNaoReconhecido: true,
  };
}

const SUFIXOS_SOCIETARIOS = [
  'SOCIEDADE ANONIMA',
  'EIRELI',
  'LTDA',
  'LTD',
  'S/A',
  'S.A.',
  'S A',
  'SA',
  'EPP',
  'MEI',
  'ME',
];

const PALAVRAS_CURINGA = new Set([
  'DE',
  'DA',
  'DO',
  'DAS',
  'DOS',
  'E',
  'COM',
  'COMERCIO',
  'COMERCIAL',
  'IND',
  'INDUSTRIA',
  'INDUSTRIAL',
  'SERVICOS',
  'SERV',
  'CIA',
  'EMPRESA',
  'BRASIL',
  'BRASILEIRA',
]);

/**
 * Normalização: maiúsculas, sem acentos, sem pontuação, espaços colapsados,
 * removendo sufixos societários (LTDA, ME, EPP, EIRELI, S/A, SA).
 */
export function normalizarNome(nome: string): string {
  if (!nome) return '';

  let s = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // Remove prefixos comuns de contas contábeis caso existam (ex: "FORNECEDOR - ")
  s = s.replace(/^ADIANT\.?\s*(A\s*FORNECEDORES?)?\s*[-:]?\s*/i, '');

  // Substitui S/A e S.A. antes de remover pontuação
  s = s.replace(/\bS\s*[/.]\s*A\.?\b/g, ' SA ');

  // Remove pontuação mantendo letras, números e espaços
  s = s.replace(/[^A-Z0-9\s]/g, ' ');

  // Colapsa espaços
  s = s.replace(/\s+/g, ' ').trim();

  // Remove sufixos societários no final (repetidamente se houver ex: "LTDA ME")
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const sufixo of SUFIXOS_SOCIETARIOS) {
      const regexFim = new RegExp(`\\b${sufixo.replace(/\s+/g, '\\s+')}$`, 'i');
      if (regexFim.test(s)) {
        s = s.replace(regexFim, '').trim();
        mudou = true;
      }
    }
  }

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extrai tokens significativos (removendo palavras-curinga como DE, DA, DO, E, COM, COMERCIO, IND)
 */
export function extrairTokensSignificativos(nomeNormalizado: string): string[] {
  if (!nomeNormalizado) return [];
  const tokens = nomeNormalizado
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !PALAVRAS_CURINGA.has(t));
  return tokens.length > 0 ? tokens : nomeNormalizado.split(' ').filter(Boolean);
}

/**
 * Distância e similaridade de Jaro-Winkler (0 a 1)
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }

  const transpositions = t / 2;
  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3;

  // Prefixo comum até 4 caracteres
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Similaridade de Jaccard entre conjuntos de tokens significativos (0 a 1)
 */
export function jaccardTokens(s1: string, s2: string): number {
  const t1 = extrairTokensSignificativos(s1);
  const t2 = extrairTokensSignificativos(s2);
  if (t1.length === 0 || t2.length === 0) return 0;

  const set1 = new Set(t1);
  const set2 = new Set(t2);

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      intersection++;
    } else {
      // Verifica se um token é prefixo longo do outro (ex: truncamento na última palavra)
      for (const token2 of set2) {
        if (
          token.length >= 4 &&
          token2.length >= 4 &&
          (token.startsWith(token2) || token2.startsWith(token))
        ) {
          intersection += 0.85;
          break;
        }
      }
    }
  }

  const union = set1.size + set2.size - intersection;
  return union <= 0 ? 0 : Math.min(1, intersection / union);
}

/**
 * Verifica se um nome normalizado é versão truncada do outro (mínimo 15 caracteres).
 * O balancete frequentemente corta nomes em ~40 caracteres.
 */
export function isNomeTruncado(nomeRelatorioNorm: string, nomeBalanceteNorm: string): boolean {
  if (!nomeRelatorioNorm || !nomeBalanceteNorm) return false;
  const minLen = Math.min(nomeRelatorioNorm.length, nomeBalanceteNorm.length);
  if (minLen < 15) return false;

  return (
    nomeRelatorioNorm.startsWith(nomeBalanceteNorm) ||
    nomeBalanceteNorm.startsWith(nomeRelatorioNorm)
  );
}

/**
 * Calcula pontuação combinada (Jaro-Winkler + Jaccard de tokens sem palavras-curinga)
 */
export function calcularSimilaridadeNomes(
  nomeRelatorioNorm: string,
  nomeBalanceteNorm: string
): number {
  if (!nomeRelatorioNorm || !nomeBalanceteNorm) return 0;
  if (nomeRelatorioNorm === nomeBalanceteNorm) return 1.0;

  // Se um é truncamento longo, compara também o prefixo do mesmo tamanho
  const minLen = Math.min(nomeRelatorioNorm.length, nomeBalanceteNorm.length);
  const jwFull = jaroWinkler(nomeRelatorioNorm, nomeBalanceteNorm);
  const jwPrefix =
    minLen >= 15
      ? jaroWinkler(
          nomeRelatorioNorm.slice(0, minLen),
          nomeBalanceteNorm.slice(0, minLen)
        ) * 0.96
      : 0;
  const jw = Math.max(jwFull, jwPrefix);

  const jaccard = jaccardTokens(nomeRelatorioNorm, nomeBalanceteNorm);

  // Combinação ponderada: Jaro-Winkler (65%) + Jaccard de tokens (35%)
  // Se ambos os primeiros tokens principais coincidirem e Jaro-Winkler for alto, valoriza
  const combined = jw * 0.65 + jaccard * 0.35;
  return Math.min(0.99, Math.max(combined, jw * 0.92));
}

/**
 * Formatação monetária padrão pt-BR (#.##0,00)
 */
export function formatarMoeda(valor: number, mostrarTracoSeZero = false, tolerancia = 0.005): string {
  if (mostrarTracoSeZero && Math.abs(valor) <= tolerancia) {
    return '-';
  }
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/**
 * Arredonda número para 2 casas decimais evitando imprecisão de ponto flutuante
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

const TIPOS_TITULO_EXCLUIDOS = new Set([
  'TX',
  'ISS',
  'INS',
  'GUI',
  'FOL',
  'FER',
  'RES',
  'DARF',
  'GPS',
  'FGTS',
  'IR',
  'PIS',
  'COF',
  'CSL',
  'ICMS',
  'IPI',
  '131',
  '132',
]);

const REGEX_TERMOS_EXCLUIDOS =
  /\b(UNIAO|RECEITA FEDERAL|SECRETARIA DA FAZENDA|SEFAZ|PREFEITURA|MUNICIPIO DE|INPS|INSS|INSTITUTO NACIONAL DO SEGURO SOCIAL|FGTS|DARF|IPTU|ISSQN|ICMS A RECOLHER|IMPOSTOS? A RECOLHER|TRIBUTOS? A RECOLHER|CONTRIBUICOES A RECOLHER|BANCO DO BRASIL|BANCO ITAU|ITAU UNIBANCO|ITAU BBA|BANCO BRADESCO|BANCO SANTANDER|CAIXA ECONOMICA|BANCO SAFRA|BTG PACTUAL|BANCO VOTORANTIM|BANCO DAYCOVAL|BANCO ABC|BANCO ALFA|SICOOB|SICREDI|CITIBANK|BNDES|FINAME|EMPRESTIMOS?|FINANCIAMENTOS?|CAPITAL DE GIRO|CONTA GARANTIDA|LEASING|ARRENDAMENTO MERCANTIL|ADIANTAMENTO DE SALARIOS?|ADIANTAMENTOS? DE SALARIOS?|ADIANTAMENTO SALARIAL|ADIANTAMENTO QUINZENAL|ADIANTAMENTO A FUNCIONARIOS?|ADIANTAMENTO A EMPREGADOS?|ADIANTAMENTO A COLABORADORES?|FOLHA DE PAGAMENTO|SALARIOS A PAGAR|OBRIGACOES TRABALHISTAS|PREVIDENCIARIAS|RESCISAO|PRO LABORE|PENSAO ALIMENTICIA|ADIANTAMENTO DE CLIENTES?|ADIANTAMENTOS? DE CLIENTES?|ADIANTAMENTO CLIENTES?|ADIANTAMENTO RECEBIDO DE CLIENTES?)\b/i;

function removerAcentosUpper(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Retorna true se o título do relatório for referente a Imposto, Banco/Empréstimo,
 * Adiantamento de Salário/Folha ou Adiantamento de Clientes (devendo ser ignorado).
 */
export function isTituloExcluidoEscopo(
  tp: string,
  codigo: string,
  nome: string,
  historico: string
): boolean {
  const tpUpper = (tp || '').trim().toUpperCase();
  if (TIPOS_TITULO_EXCLUIDOS.has(tpUpper)) {
    return true;
  }

  const codUpper = removerAcentosUpper(codigo).trim();
  if (
    codUpper === 'UNIAO' ||
    codUpper === 'INPS' ||
    codUpper === 'INSS' ||
    codUpper === 'FGTS' ||
    codUpper === 'MUNIC' ||
    codUpper === 'ESTADO'
  ) {
    return true;
  }

  const nomeLimpo = removerAcentosUpper(nome);
  const histLimpo = removerAcentosUpper(historico);

  if (REGEX_TERMOS_EXCLUIDOS.test(nomeLimpo) || REGEX_TERMOS_EXCLUIDOS.test(histLimpo)) {
    return true;
  }

  // Checa se o fornecedor começa com "BANCO "
  if (/^BANCO\s+/i.test(nomeLimpo)) {
    return true;
  }

  return false;
}

/**
 * Verifica se um código de conta contábil pertence a um prefixo configurado.
 * Suporta tanto a separação tradicional por ponto (ex: "1.1.0.60.1.0001" dentro de "1.1.0.60.1")
 * quanto a máscara expandida do TOTVS Protheus onde o subgrupo de 1 dígito se expande em 3 dígitos
 * nas contas analíticas (ex: "1.1.0.60.100.008" e "1.1.0.60.103.459" dentro de "1.1.0.60.1",
 * "1.1.0.60.200.017" dentro de "1.1.0.60.2", e "1.1.0.60.1" dentro de "1.1.0.6").
 */
export function contaPertenceAPrefixoContabil(
  conta: string,
  prefixo: string
): boolean {
  const c = (conta || '').trim().replace(/\.$/, '');
  const p = (prefixo || '').trim().replace(/\.$/, '');
  if (!c || !p) return false;

  if (c === p || c.startsWith(`${p}.`)) {
    return true;
  }

  const pParts = p.split('.');
  const cParts = c.split('.');
  if (cParts.length <= pParts.length) {
    return false;
  }

  // Todos os segmentos anteriores ao último segmento do prefixo devem ser idênticos
  for (let i = 0; i < pParts.length - 1; i++) {
    if (cParts[i] !== pParts[i]) {
      return false;
    }
  }

  // O último segmento do prefixo (ex: "1" em "1.1.0.60.1" ou "6" em "1.1.0.6")
  // expande-se no segmento correspondente da conta filha (ex: "100".."109" ou "60")
  const lastP = pParts[pParts.length - 1];
  const targetC = cParts[pParts.length - 1];
  if (lastP.length === 1 && targetC.startsWith(lastP)) {
    return true;
  }

  return false;
}

/**
 * Verifica se `contaFilha` é descendente (filha/neta) de `contaPai` na árvore do Balancete.
 */
export function contaEhFilhaDe(contaFilha: string, contaPai: string): boolean {
  const f = (contaFilha || '').trim().replace(/\.$/, '');
  const p = (contaPai || '').trim().replace(/\.$/, '');
  if (!f || !p || f === p) return false;
  return contaPertenceAPrefixoContabil(f, p);
}

/**
 * Retorna true se a conta pertencer explicitamente aos grupos contábeis de
 * Adiantamento a Fornecedores no Ativo (1.1.0.60.1, 1.1.0.60.2, 1.1.0.60.7)
 * ou Fornecedores no Passivo (2.1.0.10, 2.2.0.10.2).
 */
export function isContaEmGrupoFornecedorPadrao(conta: string): boolean {
  const prefixosFornecedor = [
    '1.1.0.60.1',
    '1.1.0.60.2',
    '1.1.0.60.7',
    '2.1.0.10',
    '2.2.0.10.2',
  ];
  return prefixosFornecedor.some((pref) =>
    contaPertenceAPrefixoContabil(conta, pref)
  );
}

/**
 * Retorna true se a conta do Balancete for referente a Imposto, Banco/Empréstimo,
 * Adiantamento de Salário/Folha ou Adiantamento de Clientes (devendo ser ignorada).
 */
export function isContaBalanceteExcluidaEscopo(
  conta: string,
  descricao: string,
  grupoDescricao: string
): boolean {
  const c = (conta || '').trim();

  // Exclui explicitamente Adiantamento de Salários (1.1.0.60.3 / 1.1.0.60.3xx),
  // Empréstimos (2.1.0.20), Obrigações Trabalhistas (2.1.0.30), Impostos (2.1.0.40) e Clientes (1.1.0.20 / 2.1.0.50)
  const prefixosExcluidos = [
    '1.1.0.10',
    '1.1.0.20',
    '1.1.0.60.3',
    '2.1.0.20',
    '2.1.0.30',
    '2.1.0.40',
    '2.1.0.50',
  ];
  if (prefixosExcluidos.some((pref) => contaPertenceAPrefixoContabil(c, pref))) {
    return true;
  }

  // Se a conta analítica pertence diretamente aos subgrupos oficiais de Fornecedores (Passivo)
  // ou Adiantamento a Fornecedores (Ativo: 1.1.0.60.1, 1.1.0.60.2, 1.1.0.60.7),
  // NÃO exclui por palavras do nome para preservar 100% da soma contábil do grupo no Balancete.
  if (isContaEmGrupoFornecedorPadrao(c)) {
    return false;
  }

  const descLimpa = removerAcentosUpper(descricao);
  const grupoLimpo = removerAcentosUpper(grupoDescricao);

  if (
    REGEX_TERMOS_EXCLUIDOS.test(descLimpa) ||
    REGEX_TERMOS_EXCLUIDOS.test(grupoLimpo)
  ) {
    return true;
  }

  if (/^BANCO\s+/i.test(descLimpa) || /^BANCOS\s+/i.test(grupoLimpo)) {
    return true;
  }

  return false;
}

const DESCRICOES_SINTETICAS_GRUPO = new Set([
  'ATIVO',
  'ATIVO CIRCULANTE',
  'ATIVO NAO CIRCULANTE',
  'PASSIVO',
  'PASSIVO CIRCULANTE',
  'PASSIVO NAO CIRCULANTE',
  'FORNECEDORES',
  'FORNECEDORES NACIONAIS',
  'FORNECEDORES EXTERIOR',
  'FORNECEDORES NO EXTERIOR',
  'FORNECEDORES NACIONAIS E EXTERIOR',
  'FORNECEDORES MATERIA PRIMA',
  'FORNECEDORES MATERIA-PRIMA',
  'FORNECEDORES DE MATERIA PRIMA',
  'FORNECEDORES PARTES NAO RELACIONADAS',
  'FORNECEDORES PARTES RELACIONADAS',
  'FORNECEDORES DE LONGO PRAZO',
  'FORNECEDORES LONGO PRAZO',
  'ADIANTAMENTOS',
  'ADIANTAMENTOS CONCEDIDOS',
  'ADIANTAMENTO A FORNECEDORES',
  'ADIANTAMENTOS A FORNECEDORES',
  'ADIANTAMENTO FORNECEDORES MATERIA PRIMA',
  'ADIANTAMENTO FORNECEDORES - EXTRA SUCATA',
  'ADIANTAMENTO FORNECEDORES EXTRA SUCATA',
  'ADIANTAMENTO A FORNECEDORES NACIONAIS',
  'ADIANTAMENTO A FORNECEDORES EXTERIOR',
  'ADIANTAMENTO A FORNECEDORES NO EXTERIOR',
]);

/**
 * Verifica se uma conta do balancete é sintética (conta pai/grupo), seja por possuir
 * contas filhas na árvore, por ser um código de grupo sintético ou por título de grupo.
 */
export function isContaSinteticaPorEstrutura(
  conta: string,
  descricao: string,
  temFilhaNaArvore: boolean
): boolean {
  if (temFilhaNaArvore) return true;

  const codigo = (conta || '').trim().replace(/\.$/, '');
  const partes = codigo.split('.');

  // Contas de nível 1 a 4 (ex: 1, 1.1, 1.1.0, 1.1.0.6, 1.1.0.60, 2.1.0.10) são sempre sintéticas
  if (partes.length <= 4) {
    return true;
  }

  // Subgrupos sintéticos de 5 níveis (ex: 1.1.0.60.1, 1.1.0.60.2, 1.1.0.60.7, 2.1.0.10.1, 2.2.0.10.2)
  if (
    partes.length === 5 &&
    partes[4].length <= 2 &&
    (codigo.startsWith('2.1.0.10.') ||
      codigo.startsWith('2.2.0.10.') ||
      codigo.startsWith('1.1.0.60.'))
  ) {
    return true;
  }

  const descLimpa = removerAcentosUpper(descricao)
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (DESCRICOES_SINTETICAS_GRUPO.has(descLimpa)) {
    return true;
  }

  return false;
}



