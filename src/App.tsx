import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import {
  AbaPrincipal,
  ActiveTab,
  AppConfig,
  ContaBalancete,
  DEFAULT_CONFIG,
  DeParaRule,
  LinhaConciliacao,
  OverrideUsuario,
  StatusConciliacao,
  TituloPagar,
  TotaisControleBalancete,
  TotaisControleRelatorio,
} from './types/reconciliation';
import {
  parseArquivoMesAnterior,
  parseBalancete,
  parseRelatorioTitulos,
} from './utils/parsers';
import { executarConciliacaoAba } from './utils/reconciliationEngine';
import { exportarConciliacaoExcel } from './utils/excelExport';
import {
  baixarPlanilhasExemplo,
  carregarDadosDemonstracao,
} from './utils/sampleData';
import { UploadControlPanel } from './components/UploadControlPanel';
import { SummaryTab } from './components/SummaryTab';
import { ReconciliationTable } from './components/ReconciliationTable';
import { DeParaTab } from './components/DeParaTab';
import { ConfigTab } from './components/ConfigTab';

const STORAGE_KEY_CONFIG = 'conciliacao_fornecedores_config_v1';
const STORAGE_KEY_DEPARA = 'conciliacao_fornecedores_depara_v1';
const STORAGE_KEY_OVERRIDES = 'conciliacao_fornecedores_overrides_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('RESUMO');

  // Persistência em localStorage: Configurações (sempre iniciando na visão consolidada por código: separarPorLoja = false)
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved), separarPorLoja: false };
      }
    } catch {
      // ignora erro de leitura do localStorage
    }
    return DEFAULT_CONFIG;
  });

  // Persistência em localStorage: Vínculos Manuais De-Para (garantindo que PA só tenha contas do Ativo 1.x e CAP só Passivo 2.x)
  const [regrasDePara, setRegrasDePara] = useState<DeParaRule[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DEPARA);
      if (saved) {
        const parsed: DeParaRule[] = JSON.parse(saved);
        return parsed
          .map((r) => ({
            ...r,
            contasCodigos: (r.contasCodigos || []).filter((c) =>
              r.aba === 'PA'
                ? c.trim().startsWith('1.')
                : c.trim().startsWith('2.')
            ),
          }))
          .filter((r) => r.contasCodigos.length > 0);
      }
    } catch {
      // ignora
    }
    return [];
  });

  // Persistência em localStorage: Status e Motivos definidos manualmente
  const [overrides, setOverrides] = useState<Record<string, OverrideUsuario>>(
    () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_OVERRIDES);
        if (saved) return JSON.parse(saved);
      } catch {
        // ignora
      }
      return {};
    }
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch {
      // ignora
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DEPARA, JSON.stringify(regrasDePara));
    } catch {
      // ignora
    }
  }, [regrasDePara]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides));
    } catch {
      // ignora
    }
  }, [overrides]);

  // Dados carregados em memória (100% no navegador)
  const [titulos, setTitulos] = useState<TituloPagar[]>([]);
  const [contasAnaliticas, setContasAnaliticas] = useState<ContaBalancete[]>(
    []
  );
  const [controleRelatorio, setControleRelatorio] =
    useState<TotaisControleRelatorio | null>(null);
  const [controleBalancete, setControleBalancete] =
    useState<TotaisControleBalancete | null>(null);

  const [progresso, setProgresso] = useState<{
    ativo: boolean;
    pct: number;
    mensagem: string;
  }>({ ativo: false, pct: 0, mensagem: '' });
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [resumoHeranca, setResumoHeranca] = useState<{
    qtdLinhasHerdadas: number;
    qtdVinculosManuais: number;
  } | null>(null);
  const [exportandoExcel, setExportandoExcel] = useState(false);

  // Carrega dados de demonstração inicialmente para avaliação imediata
  useEffect(() => {
    carregarDadosDemonstracao()
      .then(({ relatorio, balancete }) => {
        setTitulos(relatorio.titulos);
        setControleRelatorio(relatorio.controle);
        setContasAnaliticas(balancete.contasAnaliticas);
        setControleBalancete(balancete.controle);
      })
      .catch(() => {
        // fallback silencioso
      });
  }, []);

  const handleUpdateConfig = (partial: Partial<AppConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  // Upload do Relatório de Títulos a Pagar
  const handleUploadRelatorio = async (file: File) => {
    setErroUpload(null);
    setProgresso({
      ativo: true,
      pct: 5,
      mensagem: `Iniciando leitura de ${file.name}...`,
    });
    try {
      const res = await parseRelatorioTitulos(file, (pct, mensagem) => {
        setProgresso({ ativo: true, pct, mensagem });
      });
      setTitulos(res.titulos);
      setControleRelatorio(res.controle);
    } catch (err) {
      setErroUpload(
        err instanceof Error
          ? err.message
          : 'Erro inesperado ao processar o Relatório de Títulos a Pagar.'
      );
    } finally {
      setTimeout(
        () => setProgresso({ ativo: false, pct: 0, mensagem: '' }),
        350
      );
    }
  };

  // Upload do Balancete de Verificação
  const handleUploadBalancete = async (file: File) => {
    setErroUpload(null);
    setProgresso({
      ativo: true,
      pct: 5,
      mensagem: `Iniciando leitura de ${file.name}...`,
    });
    try {
      const res = await parseBalancete(file, (pct, mensagem) => {
        setProgresso({ ativo: true, pct, mensagem });
      });
      setContasAnaliticas(res.contasAnaliticas);
      setControleBalancete(res.controle);
    } catch (err) {
      setErroUpload(
        err instanceof Error
          ? err.message
          : 'Erro inesperado ao processar o Balancete de Verificação.'
      );
    } finally {
      setTimeout(
        () => setProgresso({ ativo: false, pct: 0, mensagem: '' }),
        350
      );
    }
  };

  // Upload de Herança do Mês Anterior
  const handleUploadMesAnterior = async (file: File) => {
    setErroUpload(null);
    try {
      const res = await parseArquivoMesAnterior(file);
      setOverrides((prev) => ({ ...prev, ...res.overrides }));
      if (res.novosDePara.length > 0) {
        setRegrasDePara((prev) => {
          const mapa = new Map(prev.map((r) => [r.id, r]));
          for (const nr of res.novosDePara) {
            mapa.set(`${nr.aba}-${nr.fornecedorKeys.join('_')}`, nr);
          }
          return Array.from(mapa.values());
        });
      }
      setResumoHeranca(res.resumoImportado);
    } catch (err) {
      setErroUpload(
        err instanceof Error
          ? err.message
          : 'Não foi possível importar o arquivo do mês anterior.'
      );
    }
  };

  // Carregar Dados de Demonstração sob demanda
  const handleCarregarDemo = async () => {
    setErroUpload(null);
    const { relatorio, balancete } = await carregarDadosDemonstracao();
    setTitulos(relatorio.titulos);
    setControleRelatorio(relatorio.controle);
    setContasAnaliticas(balancete.contasAnaliticas);
    setControleBalancete(balancete.controle);
  };

  // Executa o motor de conciliação para as duas abas principais
  const linhasCAP = useMemo(() => {
    return executarConciliacaoAba(
      'CAP',
      titulos,
      contasAnaliticas,
      config,
      regrasDePara,
      overrides
    );
  }, [titulos, contasAnaliticas, config, regrasDePara, overrides]);

  const linhasPA = useMemo(() => {
    return executarConciliacaoAba(
      'PA',
      titulos,
      contasAnaliticas,
      config,
      regrasDePara,
      overrides
    );
  }, [titulos, contasAnaliticas, config, regrasDePara, overrides]);

  // Handlers de interação nas linhas
  const atualizarOverride = (
    aba: AbaPrincipal,
    chaveFornecedor: string,
    updater: (atual: OverrideUsuario) => OverrideUsuario
  ) => {
    const key = `${aba}:${chaveFornecedor}`;
    setOverrides((prev) => {
      const atual = prev[key] || { chaveLinha: chaveFornecedor, aba };
      return { ...prev, [key]: updater(atual) };
    });
  };

  const handleChangeStatusManual = (
    aba: AbaPrincipal,
    chaveFornecedor: string,
    status?: StatusConciliacao
  ) => {
    atualizarOverride(aba, chaveFornecedor, (atual) => ({
      ...atual,
      statusManual: status,
      herdadoMesAnterior: atual.herdadoMesAnterior
        ? { ...atual.herdadoMesAnterior, confirmado: true }
        : undefined,
    }));
  };

  const handleChangeMotivo = (
    aba: AbaPrincipal,
    chaveFornecedor: string,
    motivo: string
  ) => {
    atualizarOverride(aba, chaveFornecedor, (atual) => ({
      ...atual,
      motivo,
      herdadoMesAnterior: atual.herdadoMesAnterior
        ? { ...atual.herdadoMesAnterior, confirmado: true }
        : undefined,
    }));
  };

  const handleConfirmarHeranca = (
    aba: AbaPrincipal,
    chaveFornecedor: string
  ) => {
    atualizarOverride(aba, chaveFornecedor, (atual) => ({
      ...atual,
      herdadoMesAnterior: atual.herdadoMesAnterior
        ? {
            ...atual.herdadoMesAnterior,
            saldoMudou: false,
            confirmado: true,
          }
        : undefined,
    }));
  };

  const handleConfirmarSugestaoMatch = (
    aba: AbaPrincipal,
    linha: LinhaConciliacao
  ) => {
    // Marca a sugestão como confirmada e salva no De-Para para persistência
    atualizarOverride(aba, linha.chaveFornecedor, (atual) => ({
      ...atual,
      confirmadoSugestao: true,
      rejeitadoSugestao: false,
    }));

    if (linha.contasVinculadas.length > 0) {
      const novaRegra: DeParaRule = {
        id: `DP-${aba}-${linha.chaveFornecedor}`,
        aba,
        fornecedorKeys: [linha.chaveFornecedor],
        fornecedorNomes: [linha.fornecedorNome],
        contasCodigos: linha.contasVinculadas.map((c) => c.conta),
        contasDescricoes: linha.contasVinculadas.map((c) => c.descricao),
        observacao: `Confirmado a partir de correspondência ${linha.tipoCorrespondencia} (${linha.confianca}%)`,
        updatedAt: new Date().toISOString(),
      };
      setRegrasDePara((prev) => [
        ...prev.filter((r) => r.id !== novaRegra.id),
        novaRegra,
      ]);
    }
  };

  const handleDesfazerVinculo = (
    aba: AbaPrincipal,
    linha: LinhaConciliacao
  ) => {
    // Remove qualquer regra De-Para que envolva este fornecedor nesta aba e marca sugestão automática como rejeitada
    setRegrasDePara((prev) =>
      prev.filter(
        (r) =>
          !(
            r.aba === aba &&
            (r.fornecedorKeys.includes(linha.chaveFornecedor) ||
              r.fornecedorKeys.includes(linha.codigo))
          )
      )
    );

    atualizarOverride(aba, linha.chaveFornecedor, (atual) => ({
      ...atual,
      confirmadoSugestao: false,
      rejeitadoSugestao: true,
    }));
  };

  const handleSalvarVinculoManual = (
    aba: AbaPrincipal,
    fornecedorKeys: string[],
    fornecedorNomes: string[],
    contasCodigos: string[],
    contasDescricoes: string[],
    observacao?: string
  ) => {
    const idRegra = `DP-${aba}-${fornecedorKeys.join('_')}`;
    const novaRegra: DeParaRule = {
      id: idRegra,
      aba,
      fornecedorKeys,
      fornecedorNomes,
      contasCodigos,
      contasDescricoes,
      observacao,
      updatedAt: new Date().toISOString(),
    };

    // Remove regras antigas na mesma aba que conflitem com os mesmos fornecedores
    setRegrasDePara((prev) => {
      const semConflito = prev.filter(
        (r) =>
          !(
            r.aba === aba &&
            r.fornecedorKeys.some((k) => fornecedorKeys.includes(k))
          )
      );
      return [...semConflito, novaRegra];
    });

    // Limpa flag de rejeição se houver
    for (const k of fornecedorKeys) {
      atualizarOverride(aba, k, (atual) => ({
        ...atual,
        rejeitadoSugestao: false,
        confirmadoSugestao: true,
      }));
    }
  };

  const handleExportarExcel = async () => {
    setExportandoExcel(true);
    try {
      await exportarConciliacaoExcel(
        linhasCAP,
        linhasPA,
        regrasDePara,
        config
      );
    } finally {
      setExportandoExcel(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zonas (Brand | 5 Nav Links | 1 Primary CTA) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800 no-print">
        <a
          href="#resumo"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('RESUMO');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Conciliação de Fornecedores
        </a>

        <nav className="flex items-center gap-6 text-xs font-medium text-slate-300 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('RESUMO')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'RESUMO'
                ? 'text-white font-semibold underline underline-offset-4'
                : 'hover:text-white'
            }`}
          >
            Resumo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CAP')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'CAP'
                ? 'text-white font-semibold underline underline-offset-4'
                : 'hover:text-white'
            }`}
          >
            Contas a Pagar ({linhasCAP.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PA')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'PA'
                ? 'text-white font-semibold underline underline-offset-4'
                : 'hover:text-white'
            }`}
          >
            Pagamento Antecipado ({linhasPA.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DE_PARA')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'DE_PARA'
                ? 'text-white font-semibold underline underline-offset-4'
                : 'hover:text-white'
            }`}
          >
            De-Para ({regrasDePara.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CONFIG')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'CONFIG'
                ? 'text-white font-semibold underline underline-offset-4'
                : 'hover:text-white'
            }`}
          >
            Configurações
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportarExcel}
            disabled={exportandoExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exportandoExcel ? 'Gerando Excel...' : 'Exportar Excel (.xlsx)'}
          </button>
        </div>
      </header>

      {/* Cabeçalho exclusivo para Impressão / PDF */}
      <div className="hidden print-only p-4 border-b border-slate-300 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Conciliação de Fornecedores — TOTVS Protheus × Balancete Contábil
            </h1>
            <p className="text-xs text-slate-600">
              Empresa: {config.empresa} · Competência: {config.competencia} · Emitido em:{' '}
              {new Date().toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-barra de Contexto e Impressão / PDF */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">
            Empresa: {config.empresa}
          </span>
          <span aria-hidden="true">·</span>
          <span>Competência: {config.competencia}</span>
          <span aria-hidden="true">·</span>
          <span>
            Títulos lidos:{' '}
            <strong className="font-mono tabular-nums text-slate-900">
              {controleRelatorio?.totalTitulos.toLocaleString('pt-BR') || 0}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Contas analíticas:{' '}
            <strong className="font-mono tabular-nums text-slate-900">
              {controleBalancete?.totalContasAnaliticas.toLocaleString('pt-BR') || 0}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={handlePrintPdf}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          Imprimir / PDF (Portable Document Format)
        </button>
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6">
        {/* Painel de Upload e Totais de Controle */}
        <UploadControlPanel
          controleRelatorio={controleRelatorio}
          controleBalancete={controleBalancete}
          progresso={progresso}
          erroUpload={erroUpload}
          resumoHeranca={resumoHeranca}
          onUploadRelatorio={handleUploadRelatorio}
          onUploadBalancete={handleUploadBalancete}
          onUploadMesAnterior={handleUploadMesAnterior}
          onCarregarDemo={handleCarregarDemo}
          onBaixarExemplos={baixarPlanilhasExemplo}
        />

        {/* Abas de Trabalho */}
        {activeTab === 'RESUMO' && (
          <SummaryTab
            linhasCAP={linhasCAP}
            linhasPA={linhasPA}
            config={config}
            onUpdateConfig={handleUpdateConfig}
            onNavigateToAba={(aba) => setActiveTab(aba)}
          />
        )}

        {activeTab === 'CAP' && (
          <ReconciliationTable
            aba="CAP"
            linhas={linhasCAP}
            contasAnaliticas={contasAnaliticas}
            config={config}
            onUpdateConfig={handleUpdateConfig}
            onChangeStatusManual={(chave, st) =>
              handleChangeStatusManual('CAP', chave, st)
            }
            onChangeMotivo={(chave, mot) =>
              handleChangeMotivo('CAP', chave, mot)
            }
            onConfirmarSugestaoMatch={(linha) =>
              handleConfirmarSugestaoMatch('CAP', linha)
            }
            onDesfazerVinculo={(linha) => handleDesfazerVinculo('CAP', linha)}
            onSalvarVinculoManual={(fKeys, fNomes, cCodigos, cDescs, obs) =>
              handleSalvarVinculoManual(
                'CAP',
                fKeys,
                fNomes,
                cCodigos,
                cDescs,
                obs
              )
            }
            onConfirmarHeranca={(chave) => handleConfirmarHeranca('CAP', chave)}
          />
        )}

        {activeTab === 'PA' && (
          <ReconciliationTable
            aba="PA"
            linhas={linhasPA}
            contasAnaliticas={contasAnaliticas}
            config={config}
            onUpdateConfig={handleUpdateConfig}
            onChangeStatusManual={(chave, st) =>
              handleChangeStatusManual('PA', chave, st)
            }
            onChangeMotivo={(chave, mot) =>
              handleChangeMotivo('PA', chave, mot)
            }
            onConfirmarSugestaoMatch={(linha) =>
              handleConfirmarSugestaoMatch('PA', linha)
            }
            onDesfazerVinculo={(linha) => handleDesfazerVinculo('PA', linha)}
            onSalvarVinculoManual={(fKeys, fNomes, cCodigos, cDescs, obs) =>
              handleSalvarVinculoManual(
                'PA',
                fKeys,
                fNomes,
                cCodigos,
                cDescs,
                obs
              )
            }
            onConfirmarHeranca={(chave) => handleConfirmarHeranca('PA', chave)}
          />
        )}

        {activeTab === 'DE_PARA' && (
          <DeParaTab
            regras={regrasDePara}
            onSaveRegra={(nova) =>
              setRegrasDePara((prev) => [
                ...prev.filter((r) => r.id !== nova.id),
                nova,
              ])
            }
            onDeleteRegra={(id) =>
              setRegrasDePara((prev) => prev.filter((r) => r.id !== id))
            }
            onImportRegrasJson={(importadas) =>
              setRegrasDePara((prev) => {
                const map = new Map(prev.map((r) => [r.id, r]));
                for (const imp of importadas) {
                  map.set(imp.id, imp);
                }
                return Array.from(map.values());
              })
            }
          />
        )}

        {activeTab === 'CONFIG' && (
          <ConfigTab
            config={config}
            onUpdateConfig={handleUpdateConfig}
            onResetConfig={() => setConfig(DEFAULT_CONFIG)}
            onLimparOverrides={() => {
              setOverrides({});
              setResumoHeranca(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
