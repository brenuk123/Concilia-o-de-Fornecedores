import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Play,
  Upload,
} from 'lucide-react';
import {
  TotaisControleBalancete,
  TotaisControleRelatorio,
} from '../types/reconciliation';
import { formatarMoeda } from '../utils/normalization';

interface UploadControlPanelProps {
  controleRelatorio: TotaisControleRelatorio | null;
  controleBalancete: TotaisControleBalancete | null;
  progresso: { ativo: boolean; pct: number; mensagem: string };
  erroUpload: string | null;
  resumoHeranca: { qtdLinhasHerdadas: number; qtdVinculosManuais: number } | null;
  onUploadRelatorio: (file: File) => void;
  onUploadBalancete: (file: File) => void;
  onUploadMesAnterior: (file: File) => void;
  onCarregarDemo: () => void;
  onBaixarExemplos: () => void;
}

export const UploadControlPanel: React.FC<UploadControlPanelProps> = ({
  controleRelatorio,
  controleBalancete,
  progresso,
  erroUpload,
  resumoHeranca,
  onUploadRelatorio,
  onUploadBalancete,
  onUploadMesAnterior,
  onCarregarDemo,
  onBaixarExemplos,
}) => {
  const inputRelRef = useRef<HTMLInputElement>(null);
  const inputBalRef = useRef<HTMLInputElement>(null);
  const inputHerancaRef = useRef<HTMLInputElement>(null);

  const [dragRel, setDragRel] = useState(false);
  const [dragBal, setDragBal] = useState(false);
  const [mostrarDivergenciasSinteticas, setMostrarDivergenciasSinteticas] =
    useState(false);

  const handleDrop = (
    e: React.DragEvent,
    callback: (f: File) => void,
    setDrag: (b: boolean) => void
  ) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) callback(file);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 mb-6 no-print">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 mb-5 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Importação de Arquivos e Totais de Controle
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Processamento 100% local no navegador. Arraste as planilhas do TOTVS Protheus e do Balancete Contábil.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={inputHerancaRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadMesAnterior(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => inputHerancaRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Importar conciliação exportada no mês anterior para herdar Status, Motivos e De-Para"
          >
            <History className="w-3.5 h-3.5 text-slate-600" />
            Herança do Mês Anterior
          </button>

          <button
            type="button"
            onClick={onBaixarExemplos}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            Baixar Modelos (.xlsx)
          </button>

          <button
            type="button"
            onClick={onCarregarDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Carregar Dados de Demonstração
          </button>
        </div>
      </div>

      {progresso.ativo && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
            <span>{progresso.mensagem}</span>
            <span className="font-mono tabular-nums">{progresso.pct}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-transform duration-150 origin-left"
              style={{ transform: `scaleX(${Math.max(0.02, progresso.pct / 100)})` }}
            />
          </div>
        </div>
      )}

      {erroUpload && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3.5 flex items-start gap-2.5 text-xs text-red-900">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Erro na leitura do arquivo</p>
            <p className="mt-0.5 text-red-800">{erroUpload}</p>
          </div>
        </div>
      )}

      {resumoHeranca && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Herança do mês anterior aplicada:{' '}
              <strong className="font-mono tabular-nums">
                {resumoHeranca.qtdLinhasHerdadas}
              </strong>{' '}
              status/motivos e{' '}
              <strong className="font-mono tabular-nums">
                {resumoHeranca.qtdVinculosManuais}
              </strong>{' '}
              vínculos manuais importados.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ZONA 1: Relatório Títulos a Pagar */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragRel(true);
          }}
          onDragLeave={() => setDragRel(false)}
          onDrop={(e) => handleDrop(e, onUploadRelatorio, setDragRel)}
          onClick={() => inputRelRef.current?.click()}
          className={`border border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
            dragRel
              ? 'border-slate-900 bg-slate-100'
              : controleRelatorio
              ? 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
              : 'border-slate-300 hover:border-slate-400 bg-white'
          }`}
        >
          <input
            ref={inputRelRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadRelatorio(f);
              e.target.value = '';
            }}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-slate-900 text-white shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  1. Relatório &ldquo;Títulos a Pagar&rdquo; (.xlsx)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {controleRelatorio
                    ? `Arquivo carregado: ${controleRelatorio.nomeArquivo}`
                    : 'Arraste contas_a_pagar_e_PA.xlsx ou clique para selecionar (Aba "2-Titulos a pagar")'}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 shrink-0">
              <Upload className="w-3.5 h-3.5" />
              {controleRelatorio ? 'Substituir' : 'Selecionar'}
            </span>
          </div>

          {controleRelatorio ? (
            <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Títulos de Fornecedores</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  {controleRelatorio.totalTitulos.toLocaleString('pt-BR')}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {controleRelatorio.qtdIgnoradosExcluidos > 0
                    ? `${controleRelatorio.qtdIgnoradosExcluidos} ignorados (impostos/bancos/salários)`
                    : 'Apenas Fornecedores e PA Fornec.'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Saldo Fornecedores (Não PA)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  R$ {formatarMoeda(controleRelatorio.saldoTotalNaoPA)}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {controleRelatorio.qtdTitulosNaoPA} título(s) de fornecedores
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Saldo Adiant. Fornecedores (PA)</span>
                <span className="font-mono tabular-nums font-semibold text-red-700 text-sm">
                  R$ {formatarMoeda(controleRelatorio.saldoTotalPA)}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {controleRelatorio.qtdTitulosPA} título(s) PA de fornecedores
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Saldo = Vencidos Nominal + A Vencer Nominal</span>
              <span className="font-mono tabular-nums">
                Esperado teste: 3.155 títulos
              </span>
            </div>
          )}
        </div>

        {/* ZONA 2: Balancete de Verificação */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragBal(true);
          }}
          onDragLeave={() => setDragBal(false)}
          onDrop={(e) => handleDrop(e, onUploadBalancete, setDragBal)}
          onClick={() => inputBalRef.current?.click()}
          className={`border border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
            dragBal
              ? 'border-slate-900 bg-slate-100'
              : controleBalancete
              ? 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
              : 'border-slate-300 hover:border-slate-400 bg-white'
          }`}
        >
          <input
            ref={inputBalRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadBalancete(f);
              e.target.value = '';
            }}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-slate-900 text-white shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  2. Balancete de Verificação (.xlsx)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {controleBalancete
                    ? `Arquivo carregado: ${controleBalancete.nomeArquivo}`
                    : 'Arraste balancete_PRAMAR_092026.xlsx ou clique para selecionar'}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 shrink-0">
              <Upload className="w-3.5 h-3.5" />
              {controleBalancete ? 'Substituir' : 'Selecionar'}
            </span>
          </div>

          {controleBalancete ? (
            <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Contas Analíticas Ativas</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  {controleBalancete.totalContasAnaliticas.toLocaleString('pt-BR')}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Somente folhas (Fornec. / PA)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Sintéticas Descartadas</span>
                <span className="font-mono tabular-nums font-semibold text-slate-700 text-sm">
                  {controleBalancete.totalContasSinteticas.toLocaleString('pt-BR')}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Zero duplicidade de grupos
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Integridade Analíticas</span>
                {controleBalancete.divergenciasIntegridade.length === 0 ? (
                  <span className="font-medium text-emerald-700 text-xs inline-flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    100% Íntegro
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMostrarDivergenciasSinteticas((v) => !v);
                    }}
                    className="font-medium text-amber-700 underline text-xs inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {controleBalancete.divergenciasIntegridade.length} alerta(s)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Considera exclusivamente contas analíticas (ignora sintéticas)</span>
              <span className="font-mono tabular-nums">
                Apenas Fornecedores / PA
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Aviso de integridade sintética × analítica caso haja divergência */}
      {controleBalancete &&
        controleBalancete.divergenciasIntegridade.length > 0 &&
        mostrarDivergenciasSinteticas && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3.5 text-xs text-amber-950">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">
                Divergências entre Conta Sintética (Pai) e Soma das Analíticas (Filhas)
              </span>
              <button
                type="button"
                onClick={() => setMostrarDivergenciasSinteticas(false)}
                className="text-amber-800 underline cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-amber-200 text-amber-800">
                    <th className="py-1 pr-3">Conta Sintética</th>
                    <th className="py-1 pr-3">Descrição</th>
                    <th className="py-1 pr-3 text-right">Saldo Sintética</th>
                    <th className="py-1 pr-3 text-right">Soma Analíticas</th>
                    <th className="py-1 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {controleBalancete.divergenciasIntegridade.map((d) => (
                    <tr key={d.contaSintetica} className="border-b border-amber-100">
                      <td className="py-1 pr-3">{d.contaSintetica}</td>
                      <td className="py-1 pr-3 font-sans">{d.descricao}</td>
                      <td className="py-1 pr-3 text-right">
                        {formatarMoeda(d.saldoSintetica)}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {formatarMoeda(d.somaAnaliticas)}
                      </td>
                      <td className="py-1 text-right font-semibold text-red-700">
                        {formatarMoeda(d.diferenca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </section>
  );
};
