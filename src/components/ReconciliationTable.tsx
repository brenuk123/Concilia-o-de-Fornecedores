import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  RotateCcw,
  Search,
  Sparkles,
  Unlink,
} from 'lucide-react';
import {
  AbaPrincipal,
  AppConfig,
  ContaBalancete,
  LinhaConciliacao,
  MOTIVOS_PADRAO,
  StatusConciliacao,
  TipoCorrespondencia,
} from '../types/reconciliation';
import { formatarMoeda, round2 } from '../utils/normalization';
import { LinkModal } from './LinkModal';

interface ReconciliationTableProps {
  aba: AbaPrincipal;
  linhas: LinhaConciliacao[];
  contasAnaliticas: ContaBalancete[];
  config: AppConfig;
  onUpdateConfig: (partial: Partial<AppConfig>) => void;
  onChangeStatusManual: (chaveFornecedor: string, status?: StatusConciliacao) => void;
  onChangeMotivo: (chaveFornecedor: string, motivo: string) => void;
  onConfirmarSugestaoMatch: (linha: LinhaConciliacao) => void;
  onDesfazerVinculo: (linha: LinhaConciliacao) => void;
  onSalvarVinculoManual: (
    fornecedorKeys: string[],
    fornecedorNomes: string[],
    contasCodigos: string[],
    contasDescricoes: string[],
    observacao?: string
  ) => void;
  onConfirmarHeranca: (chaveFornecedor: string) => void;
}

type SortField =
  | 'codigo'
  | 'lojasTexto'
  | 'fornecedorNome'
  | 'qtdTitulos'
  | 'saldoRelatorio'
  | 'contaContabilTexto'
  | 'nomeBalanceteTexto'
  | 'saldoBalancete'
  | 'conferencia'
  | 'tipoCorrespondencia'
  | 'statusFinal'
  | 'motivo';

export const ReconciliationTable: React.FC<ReconciliationTableProps> = ({
  aba,
  linhas,
  contasAnaliticas,
  config,
  onUpdateConfig,
  onChangeStatusManual,
  onChangeMotivo,
  onConfirmarSugestaoMatch,
  onDesfazerVinculo,
  onSalvarVinculoManual,
  onConfirmarHeranca,
}) => {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroMotivo, setFiltroMotivo] = useState<string>('TODOS');
  const [sortField, setSortField] = useState<SortField>('fornecedorNome');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [modalLinha, setModalLinha] = useState<LinhaConciliacao | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(
        field === 'saldoRelatorio' ||
          field === 'saldoBalancete' ||
          field === 'conferencia' ||
          field === 'qtdTitulos'
          ? false
          : true
      );
    }
  };

  const motivosDistintosNaAba = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas) {
      if (l.motivo.trim()) s.add(l.motivo.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas]);

  const linhasFiltradasOrdenadas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const filtradas = linhas.filter((l) => {
      if (filtroStatus !== 'TODOS' && l.statusFinal !== filtroStatus) {
        return false;
      }
      if (filtroTipo !== 'TODOS' && l.tipoCorrespondencia !== filtroTipo) {
        return false;
      }
      if (filtroMotivo !== 'TODOS') {
        if (filtroMotivo === '__SEM_MOTIVO__' && l.motivo.trim() !== '') {
          return false;
        }
        if (
          filtroMotivo !== '__SEM_MOTIVO__' &&
          l.motivo.trim() !== filtroMotivo
        ) {
          return false;
        }
      }

      if (!termo) return true;
      return (
        l.codigo.toLowerCase().includes(termo) ||
        l.fornecedorNome.toLowerCase().includes(termo) ||
        l.contaContabilTexto.toLowerCase().includes(termo) ||
        l.nomeBalanceteTexto.toLowerCase().includes(termo) ||
        l.motivo.toLowerCase().includes(termo) ||
        formatarMoeda(l.saldoRelatorio).includes(termo) ||
        formatarMoeda(l.saldoBalancete).includes(termo)
      );
    });

    // Mantém "Somente no balancete" ao final se a ordenação for padrão por fornecedor
    return [...filtradas].sort((a, b) => {
      if (sortField === 'fornecedorNome') {
        const aSB = a.statusAutomatico === 'Somente no balancete' ? 1 : 0;
        const bSB = b.statusAutomatico === 'Somente no balancete' ? 1 : 0;
        if (aSB !== bSB) return aSB - bSB;
      }

      const valA = a[sortField];
      const valB = b[sortField];

      let cmp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else {
        cmp = String(valA || '').localeCompare(String(valB || ''), 'pt-BR');
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [linhas, busca, filtroStatus, filtroTipo, filtroMotivo, sortField, sortAsc]);

  const totaisRodape = useMemo(() => {
    const qtdTitulos = linhasFiltradasOrdenadas.reduce(
      (acc, l) => acc + l.qtdTitulos,
      0
    );
    const saldoRel = round2(
      linhasFiltradasOrdenadas.reduce((acc, l) => acc + l.saldoRelatorio, 0)
    );
    const saldoBal = round2(
      linhasFiltradasOrdenadas.reduce((acc, l) => acc + l.saldoBalancete, 0)
    );
    const diff = round2(saldoRel - saldoBal);
    return { qtdTitulos, saldoRel, saldoBal, diff };
  }, [linhasFiltradasOrdenadas]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 inline ml-1" />;
    }
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-white inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-white inline ml-1" />
    );
  };

  const getStatusStyle = (status: StatusConciliacao) => {
    switch (status) {
      case 'Saldo OK':
        return 'text-emerald-800 bg-emerald-50 border-emerald-200';
      case 'Ajustado':
        return 'text-teal-800 bg-teal-50 border-teal-200';
      case 'Verificar':
      case 'Pendente':
        return 'text-amber-800 bg-amber-50 border-amber-200';
      case 'Divergente':
      case 'Sem conta no balancete':
      case 'Somente no balancete':
      default:
        return 'text-red-800 bg-red-50 border-red-200';
    }
  };

  const datalistId = `motivos-datalist-${aba}`;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <datalist id={datalistId}>
        {MOTIVOS_PADRAO.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {/* Barra de Ferramentas e Filtros */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3 no-print">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {aba === 'CAP'
                ? 'Conciliação de Fornecedores — Contas a Pagar (Exclusivo Fornecedores)'
                : 'Conciliação de Adiantamento a Fornecedores (Exclusivo PA de Fornecedores · Saldos Positivados)'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {aba === 'CAP'
                ? `Escopo de Fornecedores: ${config.prefixosCAP.join(', ')} · Ignora impostos, bancos/empréstimos, folha/salários e clientes`
                : `Escopo de Adiantamento a Fornecedores: ${config.prefixosPA.join(', ')} · Ignora adiantamento de salários e de clientes`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 px-3 py-1.5 rounded-md cursor-pointer">
              <input
                type="checkbox"
                checked={config.separarPorLoja}
                onChange={(e) =>
                  onUpdateConfig({ separarPorLoja: e.target.checked })
                }
                className="rounded border-slate-300"
              />
              Separar por loja (desagrupar filiais)
            </label>
          </div>
        </div>

        {/* Linha de Busca e Seletores de Filtro */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, nome do fornecedor, conta contábil ou valor..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
          >
            <option value="TODOS">Status: Todos ({linhas.length})</option>
            <option value="Saldo OK">Saldo OK</option>
            <option value="Divergente">Divergente</option>
            <option value="Sem conta no balancete">Sem conta no balancete</option>
            <option value="Somente no balancete">Somente no balancete</option>
            <option value="Ajustado">Ajustado</option>
            <option value="Verificar">Verificar</option>
            <option value="Pendente">Pendente</option>
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
          >
            <option value="TODOS">Correspondência: Todas</option>
            <option value="Manual">Manual (De-Para)</option>
            <option value="Exata">Exata (100%)</option>
            <option value="Truncada">Truncada (40 chars)</option>
            <option value="Aproximada">Aproximada (≥ 90%)</option>
            <option value="Sugerida">Sugerida (75%–89%)</option>
            <option value="Por valor">Sugerida por valor</option>
            <option value="Ampliada">Escopo Ampliado (Fallback)</option>
            <option value="Nenhuma">Nenhuma</option>
          </select>

          <select
            value={filtroMotivo}
            onChange={(e) => setFiltroMotivo(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
          >
            <option value="TODOS">Motivo: Todos</option>
            <option value="__SEM_MOTIVO__">Sem motivo preenchido</option>
            {motivosDistintosNaAba.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela Principal com Cabeçalho Fixo e Rolagem */}
      <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-900 text-white sticky top-0 z-20">
            <tr>
              <th className="py-2.5 px-2 w-8 text-center no-print"></th>
              <th
                onClick={() => handleSort('codigo')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none"
              >
                Código {renderSortIcon('codigo')}
              </th>
              <th
                onClick={() => handleSort('lojasTexto')}
                className="py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap select-none"
              >
                Loja(s) {renderSortIcon('lojasTexto')}
              </th>
              <th
                onClick={() => handleSort('fornecedorNome')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none min-w-[210px]"
              >
                Fornecedor (Relatório) {renderSortIcon('fornecedorNome')}
              </th>
              <th
                onClick={() => handleSort('qtdTitulos')}
                className="py-2.5 px-2 font-semibold text-right cursor-pointer whitespace-nowrap select-none"
              >
                Qtd. {renderSortIcon('qtdTitulos')}
              </th>
              <th
                onClick={() => handleSort('saldoRelatorio')}
                className="py-2.5 px-2.5 font-semibold text-right cursor-pointer whitespace-nowrap select-none"
              >
                Saldo Relatório {renderSortIcon('saldoRelatorio')}
              </th>
              <th
                onClick={() => handleSort('contaContabilTexto')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none"
              >
                Conta Contábil {renderSortIcon('contaContabilTexto')}
              </th>
              <th
                onClick={() => handleSort('nomeBalanceteTexto')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none min-w-[200px]"
              >
                Nome no Balancete {renderSortIcon('nomeBalanceteTexto')}
              </th>
              <th
                onClick={() => handleSort('saldoBalancete')}
                className="py-2.5 px-2.5 font-semibold text-right cursor-pointer whitespace-nowrap select-none"
              >
                Saldo Balancete {renderSortIcon('saldoBalancete')}
              </th>
              <th
                onClick={() => handleSort('conferencia')}
                className="py-2.5 px-2.5 font-semibold text-right cursor-pointer whitespace-nowrap select-none"
              >
                Conferência {renderSortIcon('conferencia')}
              </th>
              <th
                onClick={() => handleSort('tipoCorrespondencia')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none"
              >
                Correspondência {renderSortIcon('tipoCorrespondencia')}
              </th>
              <th
                onClick={() => handleSort('statusFinal')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none"
              >
                Status {renderSortIcon('statusFinal')}
              </th>
              <th
                onClick={() => handleSort('motivo')}
                className="py-2.5 px-2.5 font-semibold cursor-pointer whitespace-nowrap select-none min-w-[240px]"
              >
                Motivo {renderSortIcon('motivo')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {linhasFiltradasOrdenadas.map((linha) => {
              const isExpanded = expandedRows.has(linha.id);
              const isSomenteBalancete =
                linha.statusAutomatico === 'Somente no balancete';
              const diffZero =
                Math.abs(linha.conferencia) <= config.tolerancia;

              return (
                <React.Fragment key={linha.id}>
                  <tr
                    className={`transition-colors ${
                      isSomenteBalancete
                        ? 'bg-amber-50/50 hover:bg-amber-50'
                        : isExpanded
                        ? 'bg-slate-100/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Botão Expandir */}
                    <td className="py-2 px-2 text-center no-print">
                      <button
                        type="button"
                        onClick={() => toggleExpand(linha.id)}
                        className="p-1 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                        title="Expandir títulos por loja e contas vinculadas"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Código */}
                    <td className="py-2 px-2.5 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {linha.codigo}
                      {linha.grupoLabel && (
                        <span className="block text-[10px] font-sans font-semibold text-slate-600">
                          {linha.grupoLabel}
                        </span>
                      )}
                    </td>

                    {/* Loja(s) */}
                    <td className="py-2 px-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      <div>{linha.lojasTexto}</div>
                      {linha.lojas.length > 1 && linha.lojaMatch && (
                        <span className="block text-[10px] font-sans font-semibold text-emerald-700 mt-0.5">
                          Match: Loja {linha.lojaMatch}
                        </span>
                      )}
                    </td>

                    {/* Fornecedor no Relatório */}
                    <td className="py-2 px-2.5 text-slate-900">
                      <div className="font-medium leading-snug">
                        {linha.fornecedorNome}
                      </div>
                      {linha.lojas.length > 1 && (
                        <div className="mt-1 space-y-0.5 text-[11px] text-slate-600 border-t border-slate-100 pt-1">
                          {linha.lojas.map((l) => (
                            <div
                              key={l.loja}
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span>
                                <strong className="font-mono text-slate-700">
                                  Loja {l.loja}:
                                </strong>{' '}
                                {l.nomeLoja}
                                {l.isMatchBalancete && (
                                  <span className="text-emerald-700 font-semibold">
                                    {' '}
                                    · Match Balancete
                                  </span>
                                )}
                              </span>
                              <span className="font-mono tabular-nums font-medium text-slate-800 whitespace-nowrap">
                                R$ {formatarMoeda(l.saldoExibicao)} ({l.qtdTitulos} tít.)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                        {linha.formatoNaoReconhecido && (
                          <span className="text-amber-700 font-medium">
                            formato não reconhecido
                          </span>
                        )}
                        {linha.alertaValorOriginalDifere && (
                          <span
                            className="text-amber-700 inline-flex items-center gap-0.5"
                            title={`${linha.qtdAlertasValorOriginal} título(s) com Valor Original diferente do saldo nominal`}
                          >
                            <AlertCircle className="w-3 h-3 inline" />
                            valor original difere do saldo ({linha.qtdAlertasValorOriginal})
                          </span>
                        )}
                        {linha.herdadoMesAnterior && (
                          <span className="text-slate-600">
                            · herdado do mês anterior
                            {!linha.herdadoMesAnterior.confirmado && (
                              <button
                                type="button"
                                onClick={() =>
                                  onConfirmarHeranca(linha.chaveFornecedor)
                                }
                                className="ml-1 text-slate-900 underline font-medium cursor-pointer no-print"
                              >
                                (confirmar)
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Quantidade de títulos */}
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {linha.qtdTitulos}
                    </td>

                    {/* Saldo no Relatório */}
                    <td
                      className={`py-2 px-2.5 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        linha.saldoRelatorio < 0
                          ? 'text-red-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {formatarMoeda(linha.saldoRelatorio)}
                    </td>

                    {/* Conta Contábil */}
                    <td className="py-2 px-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {linha.contaContabilTexto}
                    </td>

                    {/* Nome no Balancete */}
                    <td className="py-2 px-2.5 text-slate-800">
                      <div className="leading-snug">{linha.nomeBalanceteTexto}</div>
                      {linha.tipoCorrespondencia === 'Ampliada' &&
                        linha.grupoContabilTexto && (
                          <div className="text-[11px] text-amber-800 mt-0.5">
                            Grupo: {linha.grupoContabilTexto}
                          </div>
                        )}
                    </td>

                    {/* Saldo no Balancete */}
                    <td
                      className={`py-2 px-2.5 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        linha.saldoBalancete < 0
                          ? 'text-red-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {linha.grupoId && !linha.isFirstInGroup ? (
                        <span
                          className="text-slate-400 text-[11px] font-sans"
                          title={`Somado no ${linha.grupoLabel}`}
                        >
                          (no {linha.grupoLabel})
                        </span>
                      ) : (
                        formatarMoeda(linha.saldoBalancete)
                      )}
                    </td>

                    {/* Conferência (relatório - balancete) */}
                    <td
                      className={`py-2 px-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        diffZero
                          ? 'text-emerald-700'
                          : linha.conferencia < 0
                          ? 'text-red-700'
                          : 'text-amber-800'
                      }`}
                    >
                      {formatarMoeda(linha.conferencia, true, config.tolerancia)}
                    </td>

                    {/* Tipo de Correspondência + Ações Vincular / Desfazer */}
                    <td className="py-2 px-2.5 whitespace-nowrap">
                      <div className="flex items-center justify-between gap-1.5">
                        <div>
                          <span className="text-slate-800 font-medium">
                            {linha.tipoCorrespondencia}
                          </span>
                          {linha.confianca > 0 && (
                            <span className="text-slate-500 font-mono tabular-nums ml-1 text-[11px]">
                              · {linha.confianca}%
                            </span>
                          )}
                        </div>

                        {!isSomenteBalancete && (
                          <div className="flex items-center gap-1 no-print">
                            {linha.exigeConfirmacao && !linha.confirmadoUsuario && (
                              <button
                                type="button"
                                onClick={() => onConfirmarSugestaoMatch(linha)}
                                className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                title="Confirmar correspondência sugerida"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setModalLinha(linha)}
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                              title="Vincular conta(s) do balancete manualmente"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                            {linha.contasVinculadas.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onDesfazerVinculo(linha)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                title="Desfazer vínculo"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Status (Automático ou Manual) */}
                    <td className="py-2 px-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <select
                          value={linha.statusFinal}
                          onChange={(e) =>
                            onChangeStatusManual(
                              linha.chaveFornecedor,
                              e.target.value as StatusConciliacao
                            )
                          }
                          className={`text-xs font-medium px-2 py-1 rounded border focus:outline-none cursor-pointer ${getStatusStyle(
                            linha.statusFinal
                          )}`}
                        >
                          <option value={linha.statusAutomatico}>
                            {linha.statusAutomatico} (Auto)
                          </option>
                          <option value="Saldo OK">Saldo OK</option>
                          <option value="Ajustado">Ajustado</option>
                          <option value="Verificar">Verificar</option>
                          <option value="Pendente">Pendente</option>
                        </select>
                        {linha.statusManual && (
                          <button
                            type="button"
                            onClick={() =>
                              onChangeStatusManual(
                                linha.chaveFornecedor,
                                undefined
                              )
                            }
                            className="p-0.5 text-slate-400 hover:text-slate-700 no-print cursor-pointer"
                            title="Restaurar status automático"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Motivo + Sugestões Automáticas (1 clique para aceitar) */}
                    <td className="py-2 px-2.5">
                      <input
                        type="text"
                        list={datalistId}
                        value={linha.motivo}
                        onChange={(e) =>
                          onChangeMotivo(linha.chaveFornecedor, e.target.value)
                        }
                        placeholder="Digite ou selecione um motivo..."
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
                      />

                      {linha.motivosSugeridos.length > 0 && (
                        <div className="mt-1 space-y-0.5 no-print">
                          {linha.motivosSugeridos
                            .filter((s) => s.motivo !== linha.motivo)
                            .slice(0, 2)
                            .map((sug) => (
                              <button
                                key={sug.motivo}
                                type="button"
                                onClick={() =>
                                  onChangeMotivo(
                                    linha.chaveFornecedor,
                                    sug.motivo
                                  )
                                }
                                title={sug.detalhe}
                                className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 text-left leading-tight cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                <span className="underline">
                                  Sugerido: {sug.motivo}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Linha Expandida: Detalhes por Loja, Títulos de Origem e Contas Vinculadas */}
                  {isExpanded && (
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={13} className="p-4">
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                          {/* Coluna 1 & 2: Títulos do Relatório Agrupados por Loja */}
                          <div className="xl:col-span-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-slate-900">
                                Títulos de Origem no Relatório TOTVS Protheus ({linha.qtdTitulos})
                              </h4>
                              {linha.lojas.length > 1 && (
                                <div className="text-xs text-slate-600">
                                  Saldos por Loja:{' '}
                                  {linha.lojas.map((l, idx) => (
                                    <span key={l.loja}>
                                      {idx > 0 && ' · '}
                                      <strong>Loja {l.loja} ({l.nomeLoja}):</strong> R${' '}
                                      <span className="font-mono tabular-nums">
                                        {formatarMoeda(l.saldoExibicao)}
                                      </span>{' '}
                                      ({l.qtdTitulos} tít.)
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {linha.lojas.length === 0 ? (
                              <p className="text-xs text-slate-500 italic">
                                Nenhum título no relatório financeiro para esta conta (&ldquo;Somente no balancete&rdquo;).
                              </p>
                            ) : (
                              linha.lojas.map((lojaGrp) => (
                                <div
                                  key={lojaGrp.loja}
                                  className="border border-slate-200 rounded-md bg-white overflow-hidden"
                                >
                                  <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-800">
                                      Loja {lojaGrp.loja} — {lojaGrp.nomeLoja} ({lojaGrp.qtdTitulos} título(s))
                                      {lojaGrp.isMatchBalancete && (
                                        <span className="ml-2 text-emerald-700 font-semibold">
                                          · Match com o Balancete
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                                      Subtotal Loja {lojaGrp.loja}: R$ {formatarMoeda(lojaGrp.saldoExibicao)}
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-[11px]">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-slate-600 bg-slate-50/50">
                                          <th className="py-1.5 px-2.5">Prf-Número Parcela</th>
                                          <th className="py-1.5 px-2">Tp</th>
                                          <th className="py-1.5 px-2">Emissão</th>
                                          <th className="py-1.5 px-2">Vencimento</th>
                                          <th className="py-1.5 px-2 text-right">Valor Original</th>
                                          <th className="py-1.5 px-2 text-right">Saldo Nominal</th>
                                          <th className="py-1.5 px-2 text-right">Dias Atraso</th>
                                          <th className="py-1.5 px-2.5">Histórico</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {lojaGrp.titulos.map((t) => (
                                          <tr key={t.id} className="hover:bg-slate-50">
                                            <td className="py-1.5 px-2.5 font-mono tabular-nums text-slate-800">
                                              {t.prfNumeroParcela || '-'}
                                            </td>
                                            <td className="py-1.5 px-2 font-mono font-semibold text-slate-800">
                                              {t.tp}
                                            </td>
                                            <td className="py-1.5 px-2 font-mono tabular-nums text-slate-600">
                                              {t.dataEmissao}
                                            </td>
                                            <td className="py-1.5 px-2 font-mono tabular-nums text-slate-600">
                                              {t.venctoReal || t.dataVencto}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-600">
                                              {formatarMoeda(t.valorOriginal)}
                                              {t.alertaValorOriginalDifere && (
                                                <span
                                                  className="ml-1 text-amber-700 font-sans font-semibold"
                                                  title="Valor Original difere do Saldo do título"
                                                >
                                                  (!)
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                                              {formatarMoeda(t.saldo)}
                                            </td>
                                            <td
                                              className={`py-1.5 px-2 text-right font-mono tabular-nums ${
                                                t.diasAtraso > 365
                                                  ? 'text-red-700 font-semibold'
                                                  : 'text-slate-600'
                                              }`}
                                            >
                                              {t.diasAtraso}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-slate-600 truncate max-w-[220px]">
                                              {t.historico}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Coluna 3: Contas Contábeis Vinculadas e Grupo N:M */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-slate-900">
                                Contas do Balancete Vinculadas ({linha.contasVinculadas.length})
                              </h4>
                              {!isSomenteBalancete && (
                                <button
                                  type="button"
                                  onClick={() => setModalLinha(linha)}
                                  className="text-xs font-medium text-slate-700 hover:text-slate-900 underline cursor-pointer no-print"
                                >
                                  Alterar vínculo
                                </button>
                              )}
                            </div>

                            {linha.contasVinculadas.length === 0 ? (
                              <div className="border border-slate-200 rounded-md bg-white p-3 text-xs text-slate-500">
                                Nenhuma conta do balancete vinculada. Clique em{' '}
                                <strong>Alterar vínculo</strong> ou no ícone de corrente para buscar uma conta por nome ou valor.
                              </div>
                            ) : (
                              <div className="border border-slate-200 rounded-md bg-white divide-y divide-slate-100">
                                {linha.contasVinculadas.map((c) => (
                                  <div key={c.conta} className="p-3 text-xs space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono font-semibold text-slate-900">
                                        {c.conta}
                                      </span>
                                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                                        R${' '}
                                        {formatarMoeda(
                                          aba === 'PA' ? c.saldoPA : c.saldoPassivo
                                        )}
                                      </span>
                                    </div>
                                    <div className="text-slate-800 font-medium">
                                      {c.descricao}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono tabular-nums pt-1 border-t border-slate-100 flex justify-between">
                                      <span>Déb.: {formatarMoeda(c.debito)}</span>
                                      <span>Créd.: {formatarMoeda(c.credito)}</span>
                                      <span>Orig.: {c.saldoAtualTexto}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {linha.grupoLabel && (
                              <div className="border border-slate-300 rounded-md bg-slate-100 p-3 text-xs space-y-1">
                                <div className="font-semibold text-slate-900">
                                  Resumo do {linha.grupoLabel} (Conciliação Muitos-para-Muitos)
                                </div>
                                <div className="text-slate-600">
                                  Códigos participantes:{' '}
                                  <span className="font-mono">
                                    {linha.grupoFornecedoresKeys?.join(', ')}
                                  </span>
                                </div>
                                <div className="pt-1 flex justify-between font-mono tabular-nums">
                                  <span>Soma Relatório: R$ {formatarMoeda(linha.grupoSaldoRelatorioTotal || 0)}</span>
                                  <span>Soma Balancete: R$ {formatarMoeda(linha.grupoSaldoBalanceteTotal || 0)}</span>
                                </div>
                                <div className="font-mono tabular-nums font-semibold text-slate-900">
                                  Diferença do Grupo: R${' '}
                                  {formatarMoeda(linha.grupoConferenciaTotal || 0)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {linhasFiltradasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={13} className="py-10 text-center text-xs text-slate-500">
                  Nenhum registro encontrado para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>

          {/* Rodapé Fixo com Totais */}
          <tfoot className="bg-slate-100 border-t-2 border-slate-300 sticky bottom-0 z-10 text-xs font-semibold text-slate-900">
            <tr>
              <td className="py-3 px-2 no-print"></td>
              <td colSpan={3} className="py-3 px-2.5">
                TOTAL EXIBIDO ({linhasFiltradasOrdenadas.length} linhas)
              </td>
              <td className="py-3 px-2 text-right font-mono tabular-nums">
                {totaisRodape.qtdTitulos.toLocaleString('pt-BR')}
              </td>
              <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                R$ {formatarMoeda(totaisRodape.saldoRel)}
              </td>
              <td colSpan={2} className="py-3 px-2.5 text-right text-slate-600">
                Total Balancete e Diferença:
              </td>
              <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                R$ {formatarMoeda(totaisRodape.saldoBal)}
              </td>
              <td
                className={`py-3 px-2.5 text-right font-mono tabular-nums ${
                  Math.abs(totaisRodape.diff) <= config.tolerancia
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                R$ {formatarMoeda(totaisRodape.diff)}
              </td>
              <td colSpan={3} className="py-3 px-2.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal de Vínculo Manual / Grupo N:M */}
      {modalLinha && (
        <LinkModal
          aba={aba}
          linhaInicial={modalLinha}
          todasLinhasRelatorio={linhas}
          contasAnaliticas={contasAnaliticas}
          onClose={() => setModalLinha(null)}
          onSaveLink={(fKeys, fNomes, cCodigos, cDescs, obs) => {
            onSalvarVinculoManual(fKeys, fNomes, cCodigos, cDescs, obs);
            setModalLinha(null);
          }}
        />
      )}
    </div>
  );
};
