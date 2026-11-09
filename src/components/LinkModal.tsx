import React, { useMemo, useState } from 'react';
import { Check, Link2, Search, X } from 'lucide-react';
import {
  AbaPrincipal,
  ContaBalancete,
  LinhaConciliacao,
} from '../types/reconciliation';
import { formatarMoeda, normalizarNome, round2 } from '../utils/normalization';
import { contaTemNaturezaCorretaParaAba } from '../utils/reconciliationEngine';

interface LinkModalProps {
  aba: AbaPrincipal;
  linhaInicial: LinhaConciliacao;
  todasLinhasRelatorio: LinhaConciliacao[];
  contasAnaliticas: ContaBalancete[];
  onClose: () => void;
  onSaveLink: (
    fornecedorKeys: string[],
    fornecedorNomes: string[],
    contasCodigos: string[],
    contasDescricoes: string[],
    observacao?: string
  ) => void;
}

export const LinkModal: React.FC<LinkModalProps> = ({
  aba,
  linhaInicial,
  todasLinhasRelatorio,
  contasAnaliticas,
  onClose,
  onSaveLink,
}) => {
  const [buscaConta, setBuscaConta] = useState('');
  const [buscaFornecedor, setBuscaFornecedor] = useState('');
  const [mostrarApenasSaldoNaoZero, setMostrarApenasSaldoNaoZero] = useState(true);
  const [expandirMultiFornecedor, setExpandirMultiFornecedor] = useState(
    (linhaInicial.grupoFornecedoresKeys?.length || 0) > 1
  );
  const [observacao, setObservacao] = useState('');

  const [selectedFornecedorKeys, setSelectedFornecedorKeys] = useState<string[]>(
    () =>
      linhaInicial.grupoFornecedoresKeys &&
      linhaInicial.grupoFornecedoresKeys.length > 0
        ? [...linhaInicial.grupoFornecedoresKeys]
        : linhaInicial.chaveFornecedor.startsWith('BAL_')
        ? []
        : [linhaInicial.chaveFornecedor]
  );

  // Filtra apenas contas da natureza da aba (Ativo 1.x para PA, Passivo 2.x para CAP)
  const contasNaturezaAba = useMemo(() => {
    return contasAnaliticas.filter((c) =>
      contaTemNaturezaCorretaParaAba(c.conta, aba)
    );
  }, [contasAnaliticas, aba]);

  const [selectedContasCodigos, setSelectedContasCodigos] = useState<string[]>(
    () =>
      linhaInicial.contasVinculadas
        .filter((c) => contaTemNaturezaCorretaParaAba(c.conta, aba))
        .map((c) => c.conta)
  );

  const obterSaldoConta = (c: ContaBalancete) =>
    aba === 'PA' ? c.saldoPA : c.saldoPassivo;

  const fornecedoresDisponiveis = useMemo(() => {
    return todasLinhasRelatorio.filter(
      (l) => !l.chaveFornecedor.startsWith('BAL_')
    );
  }, [todasLinhasRelatorio]);

  const somaRelatorioSelecionado = useMemo(() => {
    return round2(
      fornecedoresDisponiveis
        .filter((f) => selectedFornecedorKeys.includes(f.chaveFornecedor))
        .reduce((acc, f) => acc + f.saldoRelatorio, 0)
    );
  }, [fornecedoresDisponiveis, selectedFornecedorKeys]);

  const somaBalanceteSelecionado = useMemo(() => {
    return round2(
      contasNaturezaAba
        .filter((c) => selectedContasCodigos.includes(c.conta))
        .reduce((acc, c) => acc + obterSaldoConta(c), 0)
    );
  }, [contasNaturezaAba, selectedContasCodigos, aba]);

  const diferencaCalculada = round2(
    somaRelatorioSelecionado - somaBalanceteSelecionado
  );

  const contasFiltradas = useMemo(() => {
    const termo = normalizarNome(buscaConta);
    const termoBruto = buscaConta.trim().toLowerCase();

    return contasNaturezaAba
      .filter((c) => {
        const saldo = obterSaldoConta(c);
        if (
          mostrarApenasSaldoNaoZero &&
          Math.abs(saldo) < 0.01 &&
          !selectedContasCodigos.includes(c.conta)
        ) {
          return false;
        }
        if (!termoBruto) return true;
        const saldoStr = formatarMoeda(saldo).toLowerCase();
        const saldoSemPonto = saldoStr.replace(/\./g, '');
        return (
          c.conta.toLowerCase().includes(termoBruto) ||
          c.descricao.toLowerCase().includes(termoBruto) ||
          (termo && c.nomeNormalizado.includes(termo)) ||
          saldoStr.includes(termoBruto) ||
          saldoSemPonto.includes(termoBruto) ||
          c.grupoDescricao.toLowerCase().includes(termoBruto)
        );
      })
      .sort((a, b) => {
        const aSel = selectedContasCodigos.includes(a.conta) ? 0 : 1;
        const bSel = selectedContasCodigos.includes(b.conta) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;

        // Ordena pela proximidade ao saldo do relatório selecionado
        const diffA = Math.abs(somaRelatorioSelecionado - obterSaldoConta(a));
        const diffB = Math.abs(somaRelatorioSelecionado - obterSaldoConta(b));
        return diffA - diffB;
      })
      .slice(0, 150);
  }, [
    contasNaturezaAba,
    buscaConta,
    mostrarApenasSaldoNaoZero,
    selectedContasCodigos,
    somaRelatorioSelecionado,
    aba,
  ]);

  const fornecedoresFiltrados = useMemo(() => {
    const termo = buscaFornecedor.trim().toLowerCase();
    return fornecedoresDisponiveis
      .filter((f) => {
        if (!termo) return true;
        return (
          f.codigo.toLowerCase().includes(termo) ||
          f.fornecedorNome.toLowerCase().includes(termo) ||
          formatarMoeda(f.saldoRelatorio).includes(termo)
        );
      })
      .sort((a, b) => {
        const aSel = selectedFornecedorKeys.includes(a.chaveFornecedor) ? 0 : 1;
        const bSel = selectedFornecedorKeys.includes(b.chaveFornecedor) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return a.fornecedorNome.localeCompare(b.fornecedorNome);
      });
  }, [fornecedoresDisponiveis, buscaFornecedor, selectedFornecedorKeys]);

  const toggleConta = (contaCodigo: string) => {
    setSelectedContasCodigos((prev) =>
      prev.includes(contaCodigo)
        ? prev.filter((c) => c !== contaCodigo)
        : [...prev, contaCodigo]
    );
  };

  const toggleFornecedor = (chave: string) => {
    setSelectedFornecedorKeys((prev) =>
      prev.includes(chave) ? prev.filter((k) => k !== chave) : [...prev, chave]
    );
  };

  const handleConfirm = () => {
    if (selectedFornecedorKeys.length === 0 || selectedContasCodigos.length === 0) {
      return;
    }
    const forns = fornecedoresDisponiveis.filter((f) =>
      selectedFornecedorKeys.includes(f.chaveFornecedor)
    );
    const contas = contasNaturezaAba.filter((c) =>
      selectedContasCodigos.includes(c.conta)
    );

    onSaveLink(
      forns.map((f) => f.chaveFornecedor),
      forns.map((f) => f.fornecedorNome),
      contas.map((c) => c.conta),
      contas.map((c) => c.descricao),
      observacao.trim() || undefined
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Link2 className="w-4 h-4 text-slate-300" />
            <div>
              <h3 className="text-sm font-semibold">
                Vincular Fornecedor × Conta Contábil ({aba === 'PA' ? 'Ativo — Adiantamento a Fornecedores' : 'Passivo — Contas a Pagar'})
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Selecione uma ou mais contas analíticas do {aba === 'PA' ? 'Ativo (1.1.0.60.*)' : 'Passivo (2.1.0.10.* / 2.2.0.10.2.*)'} para vincular ao fornecedor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-300 hover:text-white rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Lado 1: Fornecedor(es) no Relatório */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <span className="font-semibold text-slate-800">
                  Fornecedor(es) no Relatório ({selectedFornecedorKeys.length} selecionado(s)):
                </span>{' '}
                <span className="text-slate-600">
                  {fornecedoresDisponiveis
                    .filter((f) => selectedFornecedorKeys.includes(f.chaveFornecedor))
                    .map((f) => `${f.codigo} (${f.fornecedorNome})`)
                    .join(' + ') || 'Nenhum fornecedor selecionado'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpandirMultiFornecedor((v) => !v)}
                className="text-xs font-medium text-slate-700 hover:text-slate-900 underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {expandirMultiFornecedor
                  ? 'Ocultar seleção de múltiplos códigos'
                  : '+ Agrupar outros códigos do relatório (N:M)'}
              </button>
            </div>

            {expandirMultiFornecedor && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={buscaFornecedor}
                    onChange={(e) => setBuscaFornecedor(e.target.value)}
                    placeholder="Buscar outro código, nome ou valor no relatório..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-md bg-white divide-y divide-slate-100">
                  {fornecedoresFiltrados.map((f) => {
                    const checked = selectedFornecedorKeys.includes(
                      f.chaveFornecedor
                    );
                    return (
                      <label
                        key={f.chaveFornecedor}
                        className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 ${
                          checked ? 'bg-slate-100/80 font-medium' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate pr-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFornecedor(f.chaveFornecedor)}
                            className="rounded border-slate-300"
                          />
                          <span className="font-mono text-slate-700">
                            {f.codigo}
                          </span>
                          <span className="text-slate-900 truncate">
                            {f.fornecedorNome}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-800 shrink-0">
                          R$ {formatarMoeda(f.saldoRelatorio)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Lado 2: Busca de Contas Analíticas no Balancete */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <label className="text-xs font-semibold text-slate-900">
                Contas Analíticas do Balancete ({aba === 'PA' ? 'Ativo 1.1.0.60.*' : 'Passivo 2.1.0.10.*'}) ({selectedContasCodigos.length} selecionada(s))
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mostrarApenasSaldoNaoZero}
                  onChange={(e) => setMostrarApenasSaldoNaoZero(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Ocultar contas zeradas
              </label>
            </div>

            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={buscaConta}
                onChange={(e) => setBuscaConta(e.target.value)}
                placeholder={`Buscar por nome no balancete, código da conta (ex: ${
                  aba === 'PA' ? '1.1.0.60.100' : '2.1.0.10'
                }), grupo ou valor exato...`}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
                autoFocus
              />
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 w-8"></th>
                    <th className="py-2 px-3">Conta Analítica</th>
                    <th className="py-2 px-3">Nome no Balancete</th>
                    <th className="py-2 px-3 text-right">Saldo no Balancete</th>
                    <th className="py-2 px-3 text-right">Diferença p/ Forn.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contasFiltradas.map((c) => {
                    const isSelected = selectedContasCodigos.includes(c.conta);
                    const saldoC = obterSaldoConta(c);
                    const diffIndividual = round2(
                      somaRelatorioSelecionado - saldoC
                    );
                    return (
                      <tr
                        key={c.conta}
                        onClick={() => toggleConta(c.conta)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-slate-900/5 font-medium'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-300 pointer-events-none"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {c.conta}
                        </td>
                        <td className="py-2 px-3 text-slate-900">
                          {c.descricao}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {formatarMoeda(saldoC)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                            Math.abs(diffIndividual) <= 0.01
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {Math.abs(diffIndividual) <= 0.01
                            ? 'Exato (0,00)'
                            : formatarMoeda(diffIndividual)}
                        </td>
                      </tr>
                    );
                  })}
                  {contasFiltradas.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-slate-500"
                      >
                        Nenhuma conta analítica encontrada para o filtro informado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Observação opcional */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Observação do Vínculo (opcional)
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Razão social alterada ou grupo econômico unificado..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        {/* Rodapé com Simulação da Soma do Grupo e Ações */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Soma no Relatório</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                R$ {formatarMoeda(somaRelatorioSelecionado)}
              </span>
            </div>
            <span className="text-slate-400">−</span>
            <div>
              <span className="text-slate-500 block">Soma no Balancete</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                R$ {formatarMoeda(somaBalanceteSelecionado)}
              </span>
            </div>
            <span className="text-slate-400">=</span>
            <div>
              <span className="text-slate-500 block">Diferença Resultante</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  Math.abs(diferencaCalculada) <= 0.01
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                R$ {formatarMoeda(diferencaCalculada)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                selectedFornecedorKeys.length === 0 ||
                selectedContasCodigos.length === 0
              }
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-md transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Salvar Vínculo De-Para
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
