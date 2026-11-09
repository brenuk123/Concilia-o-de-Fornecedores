import React, { useMemo, useState } from 'react';
import {
  AbaPrincipal,
  AppConfig,
  LinhaConciliacao,
} from '../types/reconciliation';
import { formatarMoeda, round2 } from '../utils/normalization';

interface SummaryTabProps {
  linhasCAP: LinhaConciliacao[];
  linhasPA: LinhaConciliacao[];
  config: AppConfig;
  onUpdateConfig: (partial: Partial<AppConfig>) => void;
  onNavigateToAba: (aba: AbaPrincipal) => void;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({
  linhasCAP,
  linhasPA,
  config,
  onUpdateConfig,
  onNavigateToAba,
}) => {
  const [escopoVisao, setEscopoVisao] = useState<'CAP' | 'PA'>('CAP');

  const linhasAtivas = escopoVisao === 'CAP' ? linhasCAP : linhasPA;

  const metricas = useMemo(() => {
    const totalRel = round2(
      linhasAtivas.reduce((acc, l) => acc + l.saldoRelatorio, 0)
    );
    const totalBal = round2(
      linhasAtivas.reduce((acc, l) => acc + l.saldoBalancete, 0)
    );
    const diferencaTotal = round2(totalRel - totalBal);

    const qtdTotal = linhasAtivas.length;
    const qtdSaldoOK = linhasAtivas.filter(
      (l) => l.statusFinal === 'Saldo OK' || l.statusFinal === 'Ajustado'
    ).length;
    const qtdDivergente = linhasAtivas.filter(
      (l) =>
        l.statusFinal === 'Divergente' ||
        l.statusFinal === 'Verificar' ||
        l.statusFinal === 'Pendente'
    ).length;
    const qtdSemCorrespondencia = linhasAtivas.filter(
      (l) =>
        l.statusFinal === 'Sem conta no balancete' ||
        l.statusFinal === 'Somente no balancete'
    ).length;

    const valorAbsTotal = round2(
      linhasAtivas.reduce(
        (acc, l) =>
          acc + Math.max(Math.abs(l.saldoRelatorio), Math.abs(l.saldoBalancete)),
        0
      )
    );
    const valorAbsConciliado = round2(
      linhasAtivas
        .filter(
          (l) => l.statusFinal === 'Saldo OK' || l.statusFinal === 'Ajustado'
        )
        .reduce(
          (acc, l) =>
            acc +
            Math.max(Math.abs(l.saldoRelatorio), Math.abs(l.saldoBalancete)),
          0
        )
    );

    const pctQuantidade = qtdTotal > 0 ? (qtdSaldoOK / qtdTotal) * 100 : 0;
    const pctValor =
      valorAbsTotal > 0 ? (valorAbsConciliado / valorAbsTotal) * 100 : 0;

    return {
      totalRel,
      totalBal,
      diferencaTotal,
      qtdTotal,
      qtdSaldoOK,
      qtdDivergente,
      qtdSemCorrespondencia,
      pctQuantidade,
      pctValor,
    };
  }, [linhasAtivas]);

  // Ponte de Conciliação: Total do relatório -> (+/-) diferenças agrupadas por Motivo -> Total do balancete = 0
  const ponteConciliacao = useMemo(() => {
    const gruposMotivo = new Map<
      string,
      { motivo: string; qtd: number; somaConferencia: number }
    >();

    let residuoArredondamento = 0;

    for (const l of linhasAtivas) {
      if (Math.abs(l.conferencia) <= config.tolerancia) {
        residuoArredondamento = round2(residuoArredondamento + l.conferencia);
        continue;
      }
      const labelMotivo =
        l.motivo.trim() || `Não classificado (${l.statusFinal})`;
      const item = gruposMotivo.get(labelMotivo) || {
        motivo: labelMotivo,
        qtd: 0,
        somaConferencia: 0,
      };
      item.qtd += 1;
      item.somaConferencia = round2(item.somaConferencia + l.conferencia);
      gruposMotivo.set(labelMotivo, item);
    }

    if (Math.abs(residuoArredondamento) > 0) {
      gruposMotivo.set('Variações dentro da tolerância', {
        motivo: 'Variações dentro da tolerância',
        qtd: linhasAtivas.filter(
          (l) =>
            Math.abs(l.conferencia) > 0 &&
            Math.abs(l.conferencia) <= config.tolerancia
        ).length,
        somaConferencia: residuoArredondamento,
      });
    }

    const itens = Array.from(gruposMotivo.values()).sort(
      (a, b) => Math.abs(b.somaConferencia) - Math.abs(a.somaConferencia)
    );

    // Como Conferência = Relatório - Balancete, temos:
    // Total Relatório - Soma(Conferência por Motivo) = Total Balancete
    // Logo: Total Relatório + Soma(Ajuste onde Ajuste = -Conferência) - Total Balancete = 0
    const somaConferencias = round2(
      itens.reduce((acc, i) => acc + i.somaConferencia, 0)
    );
    const saldoCalculadoBalancete = round2(
      metricas.totalRel - somaConferencias
    );
    const fechamentoZero = round2(
      saldoCalculadoBalancete - metricas.totalBal
    );

    return {
      itens,
      somaConferencias,
      saldoCalculadoBalancete,
      fechamentoZero,
    };
  }, [linhasAtivas, config.tolerancia, metricas.totalRel, metricas.totalBal]);

  // Top 10 maiores diferenças em valor absoluto
  const top10Diferencas = useMemo(() => {
    const comDif = linhasAtivas
      .filter((l) => Math.abs(l.conferencia) > config.tolerancia)
      .sort((a, b) => Math.abs(b.conferencia) - Math.abs(a.conferencia))
      .slice(0, 10);

    const maxAbs =
      comDif.length > 0
        ? Math.max(...comDif.map((d) => Math.abs(d.conferencia)))
        : 1;

    return { lista: comDif, maxAbs };
  }, [linhasAtivas, config.tolerancia]);

  return (
    <div className="space-y-6">
      {/* Barra de Contexto, Empresa, Competência e Alternador de Visão */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-500">
              Empresa
            </label>
            <input
              type="text"
              value={config.empresa}
              onChange={(e) => onUpdateConfig({ empresa: e.target.value })}
              className="mt-0.5 px-2.5 py-1 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded focus:outline-none focus:border-slate-900 w-36"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500">
              Competência (MM/AAAA)
            </label>
            <input
              type="text"
              value={config.competencia}
              onChange={(e) => onUpdateConfig({ competencia: e.target.value })}
              placeholder="09/2026"
              className="mt-0.5 px-2.5 py-1 text-xs font-mono tabular-nums font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded focus:outline-none focus:border-slate-900 w-28"
            />
          </div>

          <div className="text-xs text-slate-600 pt-3">
            <span>Arquivo de exportação: </span>
            <span className="font-mono text-slate-900 font-medium">
              Conciliacao_Fornecedores_{config.empresa || 'PRAMAR'}_
              {(config.competencia || '092026').replace(/[^0-9]/g, '')}.xlsx
            </span>
          </div>
        </div>

        {/* Alternador de Visão no Resumo */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto no-print">
          <button
            type="button"
            onClick={() => setEscopoVisao('CAP')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              escopoVisao === 'CAP'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Contas a Pagar ({linhasCAP.length})
          </button>
          <button
            type="button"
            onClick={() => setEscopoVisao('PA')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              escopoVisao === 'PA'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pagamento Antecipado ({linhasPA.length})
          </button>
        </div>
      </div>

      {/* Cartões de Indicadores (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 block">
            Total no Relatório ({escopoVisao === 'CAP' ? 'Passivo' : 'PA Positivado'})
          </span>
          <span className="mt-1.5 block text-lg font-bold font-mono tabular-nums text-slate-900">
            R$ {formatarMoeda(metricas.totalRel)}
          </span>
          <span className="mt-1 block text-[11px] text-slate-500">
            {linhasAtivas.filter((l) => l.qtdTitulos > 0).length} fornecedores c/ títulos
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 block">
            Total no Balancete Contábil
          </span>
          <span className="mt-1.5 block text-lg font-bold font-mono tabular-nums text-slate-900">
            R$ {formatarMoeda(metricas.totalBal)}
          </span>
          <span className="mt-1 block text-[11px] text-slate-500">
            Contas analíticas no escopo
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 block">
            Diferença Total (Rel. − Bal.)
          </span>
          <span
            className={`mt-1.5 block text-lg font-bold font-mono tabular-nums ${
              Math.abs(metricas.diferencaTotal) <= config.tolerancia
                ? 'text-emerald-700'
                : 'text-red-700'
            }`}
          >
            R$ {formatarMoeda(metricas.diferencaTotal)}
          </span>
          <span className="mt-1 block text-[11px] text-slate-500">
            Tolerância configurada: R$ {formatarMoeda(config.tolerancia)}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 block">
            Status das Contas ({metricas.qtdTotal})
          </span>
          <div className="mt-1.5 space-y-0.5 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="font-sans text-emerald-800">Saldo OK / Ajustado:</span>
              <span className="font-semibold text-emerald-800">{metricas.qtdSaldoOK}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-amber-800">Divergente / Verificar:</span>
              <span className="font-semibold text-amber-800">{metricas.qtdDivergente}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-red-800">Sem correspondência:</span>
              <span className="font-semibold text-red-800">
                {metricas.qtdSemCorrespondencia}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 block">
            Índice de Conciliação (%)
          </span>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xs text-slate-600">Por Valor:</span>
            <span className="text-base font-bold font-mono tabular-nums text-slate-900">
              {metricas.pctValor.toFixed(1).replace('.', ',')}%
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs text-slate-600">Por Quantidade:</span>
            <span className="text-sm font-semibold font-mono tabular-nums text-slate-700">
              {metricas.pctQuantidade.toFixed(1).replace('.', ',')}%
            </span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Ponte de Conciliação + Gráfico Top 10 Maiores Diferenças */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ponte de Conciliação (7 colunas) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Ponte de Conciliação Contábil × Financeira ({escopoVisao === 'CAP' ? 'Contas a Pagar' : 'Pagamento Antecipado'})
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Demonstração algébrica das divergências por Motivo até o fechamento exato com o Balancete.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToAba(escopoVisao)}
              className="text-xs font-medium text-slate-700 hover:text-slate-900 underline whitespace-nowrap shrink-0 cursor-pointer no-print"
            >
              Ir para aba {escopoVisao === 'CAP' ? 'Contas a Pagar' : 'Pagamento Antecipado'} →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="py-2.5 px-4 font-semibold">
                    Etapa / Motivo da Divergência
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right">
                    Qtd. Casos
                  </th>
                  <th className="py-2.5 px-4 font-semibold text-right">
                    Diferença (Rel. − Bal.)
                  </th>
                  <th className="py-2.5 px-4 font-semibold text-right">
                    Efeito na Ponte (R$)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Ponto de Partida: Total do Relatório */}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="py-2.5 px-4">
                    1. (=) Saldo Total no Relatório Financeiro
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {linhasAtivas.filter((l) => l.qtdTitulos > 0).length}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                    —
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {formatarMoeda(metricas.totalRel)}
                  </td>
                </tr>

                {/* Linhas intermediárias agrupadas por Motivo */}
                {ponteConciliacao.itens.map((item) => {
                  const efeitoPonte = round2(-item.somaConferencia);
                  return (
                    <tr key={item.motivo} className="hover:bg-slate-50">
                      <td className="py-2 px-4 pl-7 text-slate-800">
                        <span className="font-mono text-slate-500 mr-1.5">
                          {efeitoPonte >= 0 ? '(+)' : '(−)'}
                        </span>
                        {item.motivo}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                        {item.qtd}
                      </td>
                      <td
                        className={`py-2 px-4 text-right font-mono tabular-nums ${
                          item.somaConferencia < 0
                            ? 'text-red-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {formatarMoeda(item.somaConferencia)}
                      </td>
                      <td
                        className={`py-2 px-4 text-right font-mono tabular-nums font-medium ${
                          efeitoPonte < 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {efeitoPonte >= 0 ? '+' : ''}
                        {formatarMoeda(efeitoPonte)}
                      </td>
                    </tr>
                  );
                })}

                {ponteConciliacao.itens.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-4 px-4 text-center text-slate-500"
                    >
                      Nenhuma divergência registrada — Relatório e Balancete já são idênticos.
                    </td>
                  </tr>
                )}

                {/* Ponto de Chegada: Total do Balancete */}
                <tr className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-300">
                  <td className="py-2.5 px-4">
                    2. (=) Saldo Total no Balancete de Verificação
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {linhasAtivas.filter((l) => l.contasVinculadas.length > 0).length}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {formatarMoeda(ponteConciliacao.somaConferencias)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {formatarMoeda(metricas.totalBal)}
                  </td>
                </tr>

                {/* Fechamento = 0,00 */}
                <tr className="bg-emerald-50/80 font-bold text-emerald-950">
                  <td className="py-2.5 px-4" colSpan={3}>
                    3. (=) Prova Real de Fechamento (Relatório ± Ajustes por Motivo − Balancete)
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-800">
                    R$ {formatarMoeda(ponteConciliacao.fechamentoZero)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Gráfico de Barras com as 10 Maiores Diferenças (5 colunas) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              10 Maiores Diferenças Absolutas ({escopoVisao === 'CAP' ? 'Contas a Pagar' : 'Pagamento Antecipado'})
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Fornecedores ou contas contábeis com maior impacto na divergência líquida.
            </p>
          </div>

          {top10Diferencas.lista.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Não há diferenças acima da tolerância nesta aba.
            </div>
          ) : (
            <div className="space-y-3">
              {top10Diferencas.lista.map((item, idx) => {
                const pctBarra = Math.max(
                  4,
                  Math.round(
                    (Math.abs(item.conferencia) / top10Diferencas.maxAbs) * 100
                  )
                );
                const nomeExibicao =
                  item.statusAutomatico === 'Somente no balancete'
                    ? `[Balancete] ${item.nomeBalanceteTexto}`
                    : `${item.codigo} · ${item.fornecedorNome}`;

                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span
                        className="text-slate-800 font-medium truncate"
                        title={nomeExibicao}
                      >
                        {idx + 1}. {nomeExibicao}
                      </span>
                      <span
                        className={`font-mono tabular-nums font-semibold shrink-0 ${
                          item.conferencia < 0
                            ? 'text-red-700'
                            : 'text-slate-900'
                        }`}
                      >
                        R$ {formatarMoeda(item.conferencia)}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className={`h-full rounded-sm ${
                          item.conferencia < 0 ? 'bg-red-600' : 'bg-slate-800'
                        }`}
                        style={{ width: `${pctBarra}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Status: {item.statusFinal}</span>
                      <span className="truncate max-w-[220px]">
                        {item.motivo || 'Sem motivo informado'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
