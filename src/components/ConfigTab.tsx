import React, { useState } from 'react';
import { RotateCcw, Save, Trash2 } from 'lucide-react';
import { AppConfig, DEFAULT_CONFIG } from '../types/reconciliation';

interface ConfigTabProps {
  config: AppConfig;
  onUpdateConfig: (partial: Partial<AppConfig>) => void;
  onResetConfig: () => void;
  onLimparOverrides: () => void;
}

export const ConfigTab: React.FC<ConfigTabProps> = ({
  config,
  onUpdateConfig,
  onResetConfig,
  onLimparOverrides,
}) => {
  const [prefixosCAPTexto, setPrefixosCAPTexto] = useState(
    config.prefixosCAP.join(', ')
  );
  const [prefixosPATexto, setPrefixosPATexto] = useState(
    config.prefixosPA.join(', ')
  );
  const [salvoMsg, setSalvoMsg] = useState(false);

  const aplicarPrefixos = () => {
    const cap = prefixosCAPTexto
      .split(/[,;\s]+/)
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter(Boolean);
    const pa = prefixosPATexto
      .split(/[,;\s]+/)
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter(Boolean);

    onUpdateConfig({
      prefixosCAP: cap.length > 0 ? cap : DEFAULT_CONFIG.prefixosCAP,
      prefixosPA: pa.length > 0 ? pa : DEFAULT_CONFIG.prefixosPA,
    });
    setSalvoMsg(true);
    setTimeout(() => setSalvoMsg(false), 2500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Parâmetros de Conciliação e Escopo Contábil
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Ajuste tolerâncias, limiares do algoritmo Jaro-Winkler/Jaccard e prefixos do plano de contas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onResetConfig();
              setPrefixosCAPTexto(DEFAULT_CONFIG.prefixosCAP.join(', '));
              setPrefixosPATexto(DEFAULT_CONFIG.prefixosPA.join(', '));
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrões
          </button>

          <button
            type="button"
            onClick={onLimparOverrides}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Motivos/Status Manuais
          </button>
        </div>
      </div>

      {/* Grupo 1: Tolerância e Agrupamento por Loja */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Tolerância de Diferença (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={config.tolerancia}
            onChange={(e) =>
              onUpdateConfig({
                tolerancia: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
            className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Diferenças em módulo menores ou iguais a este valor (padrão R$ 0,01) são exibidas como &ldquo;-&rdquo; e classificadas como &ldquo;Saldo OK&rdquo;.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Modo de Consolidação de Fornecedores
          </label>
          <label className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-md bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={config.separarPorLoja}
              onChange={(e) =>
                onUpdateConfig({ separarPorLoja: e.target.checked })
              }
              className="mt-0.5 rounded border-slate-300"
            />
            <div className="text-xs">
              <span className="font-medium text-slate-900 block">
                Separar fornecedores por loja (filial)
              </span>
              <span className="text-slate-600 text-[11px]">
                Desmarcada (padrão): consolida todas as lojas do mesmo Código de fornecedor em uma única linha expansível.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Grupo 2: Limiares de Similaridade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-200">
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Limiar de Correspondência &ldquo;Aproximada&rdquo; (Aceite Automático)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              min="0.50"
              max="0.99"
              value={config.limiarAproximada}
              onChange={(e) =>
                onUpdateConfig({
                  limiarAproximada: Math.min(
                    0.99,
                    Math.max(0.5, parseFloat(e.target.value) || 0.9)
                  ),
                })
              }
              className="w-32 px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
            />
            <span className="text-xs font-mono text-slate-600">
              ({Math.round(config.limiarAproximada * 100)}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Padrão: 0,90 (90%). Pontuações iguais ou superiores são vinculadas automaticamente como &ldquo;Aproximada&rdquo;.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Limiar de Correspondência &ldquo;Sugerida&rdquo; (Exige Confirmação)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              min="0.40"
              max="0.95"
              value={config.limiarSugerida}
              onChange={(e) =>
                onUpdateConfig({
                  limiarSugerida: Math.min(
                    config.limiarAproximada - 0.01,
                    Math.max(0.4, parseFloat(e.target.value) || 0.75)
                  ),
                })
              }
              className="w-32 px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
            />
            <span className="text-xs font-mono text-slate-600">
              ({Math.round(config.limiarSugerida * 100)}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Padrão: 0,75 (75%). Entre este valor e o limiar de aproximada, o vínculo exige confirmação do usuário.
          </p>
        </div>
      </div>

      {/* Grupo 3: Prefixos de Contas por Aba */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Prefixos de Contas — Aba &ldquo;Contas a Pagar&rdquo; (Passivo)
          </label>
          <input
            type="text"
            value={prefixosCAPTexto}
            onChange={(e) => setPrefixosCAPTexto(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Padrão: <code className="font-mono">2.1.0.10, 2.2.0.10.2</code> (inclui Fornecedores no Exterior, Matéria-Prima, Partes Não Relacionadas, Partes Relacionadas e Longo Prazo).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Prefixos de Contas — Aba &ldquo;Pagamento Antecipado&rdquo; (Exclusivo Adiantamento a Fornecedores)
          </label>
          <input
            type="text"
            value={prefixosPATexto}
            onChange={(e) => setPrefixosPATexto(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Padrão: <code className="font-mono">1.1.0.60.1, 1.1.0.60.2, 1.1.0.60.7</code> (Adiantamento a Fornecedores). Contas de impostos, bancos/empréstimos, adiantamento de salários (<code className="font-mono">1.1.0.60.3</code>) e adiantamento de clientes são bloqueadas e desconsideradas em todo o sistema e relatórios.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={aplicarPrefixos}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            Aplicar Prefixos de Conta
          </button>
          {salvoMsg && (
            <span className="text-xs font-medium text-emerald-700">
              Prefixos atualizados com sucesso!
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
