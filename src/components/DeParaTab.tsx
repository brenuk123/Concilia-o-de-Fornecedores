import React, { useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AbaPrincipal, DeParaRule } from '../types/reconciliation';

interface DeParaTabProps {
  regras: DeParaRule[];
  onSaveRegra: (regra: DeParaRule) => void;
  onDeleteRegra: (id: string) => void;
  onImportRegrasJson: (novasRegras: DeParaRule[]) => void;
}

export const DeParaTab: React.FC<DeParaTabProps> = ({
  regras,
  onSaveRegra,
  onDeleteRegra,
  onImportRegrasJson,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [criandoNova, setCriandoNova] = useState(false);

  const [formAba, setFormAba] = useState<AbaPrincipal>('CAP');
  const [formFornecedorKeys, setFormFornecedorKeys] = useState('');
  const [formFornecedorNomes, setFormFornecedorNomes] = useState('');
  const [formContasCodigos, setFormContasCodigos] = useState('');
  const [formContasDescricoes, setFormContasDescricoes] = useState('');
  const [formObservacao, setFormObservacao] = useState('');
  const [erroImport, setErroImport] = useState<string | null>(null);

  const iniciarEdicao = (r: DeParaRule) => {
    setCriandoNova(false);
    setEditandoId(r.id);
    setFormAba(r.aba);
    setFormFornecedorKeys(r.fornecedorKeys.join(', '));
    setFormFornecedorNomes(r.fornecedorNomes.join(' / '));
    setFormContasCodigos(r.contasCodigos.join(', '));
    setFormContasDescricoes(r.contasDescricoes.join(' / '));
    setFormObservacao(r.observacao || '');
  };

  const iniciarCriacao = () => {
    setEditandoId(null);
    setCriandoNova(true);
    setFormAba('CAP');
    setFormFornecedorKeys('');
    setFormFornecedorNomes('');
    setFormContasCodigos('');
    setFormContasDescricoes('');
    setFormObservacao('');
  };

  const cancelarForm = () => {
    setEditandoId(null);
    setCriandoNova(false);
  };

  const salvarForm = () => {
    const fKeys = formFornecedorKeys
      .split(/[,;+]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const fNomes = formFornecedorNomes
      .split(/[/;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cCodigos = formContasCodigos
      .split(/[,;+]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cDescs = formContasDescricoes
      .split(/[/;,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (fKeys.length === 0 || cCodigos.length === 0) return;

    const novaRegra: DeParaRule = {
      id: editandoId || `DP-${Date.now()}`,
      aba: formAba,
      fornecedorKeys: fKeys,
      fornecedorNomes: fNomes.length > 0 ? fNomes : fKeys,
      contasCodigos: cCodigos,
      contasDescricoes: cDescs.length > 0 ? cDescs : cCodigos,
      observacao: formObservacao.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    onSaveRegra(novaRegra);
    cancelarForm();
  };

  const exportarJson = () => {
    const jsonStr = JSON.stringify(regras, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DePara_Conciliacao_Fornecedores_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importarJson = async (file: File) => {
    setErroImport(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('O arquivo JSON deve conter uma lista de regras De-Para.');
      }
      const validas: DeParaRule[] = parsed
        .filter(
          (item) =>
            item &&
            Array.isArray(item.fornecedorKeys) &&
            Array.isArray(item.contasCodigos)
        )
        .map((item, idx) => ({
          id: item.id || `IMP-${Date.now()}-${idx}`,
          aba: item.aba === 'PA' ? 'PA' : 'CAP',
          fornecedorKeys: item.fornecedorKeys.map(String),
          fornecedorNomes: Array.isArray(item.fornecedorNomes)
            ? item.fornecedorNomes.map(String)
            : item.fornecedorKeys.map(String),
          contasCodigos: item.contasCodigos.map(String),
          contasDescricoes: Array.isArray(item.contasDescricoes)
            ? item.contasDescricoes.map(String)
            : item.contasCodigos.map(String),
          observacao: item.observacao ? String(item.observacao) : undefined,
          updatedAt: item.updatedAt || new Date().toISOString(),
        }));
      onImportRegrasJson(validas);
    } catch (err) {
      setErroImport(
        err instanceof Error ? err.message : 'Erro ao ler o arquivo JSON.'
      );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
             Tabela de Vínculos Manuais (De-Para)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Prioridade máxima no motor de correspondência. Salvo automaticamente no navegador (localStorage) e suporta vínculos N:M.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importarJson(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar JSON
          </button>

          <button
            type="button"
            onClick={exportarJson}
            disabled={regras.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-md transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar JSON
          </button>

          <button
            type="button"
            onClick={iniciarCriacao}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Vínculo Manual
          </button>
        </div>
      </div>

      {erroImport && (
        <div className="m-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          {erroImport}
        </div>
      )}

      {(criandoNova || editandoId) && (
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900">
              {criandoNova ? 'Adicionar Novo Vínculo De-Para' : 'Editar Vínculo De-Para'}
            </h3>
            <button
              type="button"
              onClick={cancelarForm}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Aba</label>
              <select
                value={formAba}
                onChange={(e) => setFormAba(e.target.value as AbaPrincipal)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              >
                <option value="CAP">Contas a Pagar</option>
                <option value="PA">Pagamento Antecipado</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Código(s) Relatório (separe por vírgula)
              </label>
              <input
                type="text"
                value={formFornecedorKeys}
                onChange={(e) => setFormFornecedorKeys(e.target.value)}
                placeholder="Ex: 004810, 004811"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nome(s) no Relatório
              </label>
              <input
                type="text"
                value={formFornecedorNomes}
                onChange={(e) => setFormFornecedorNomes(e.target.value)}
                placeholder="Ex: Rumo Malha Paulista"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Conta(s) Contábil(is) (separe por vírgula)
              </label>
              <input
                type="text"
                value={formContasCodigos}
                onChange={(e) => setFormContasCodigos(e.target.value)}
                placeholder="Ex: 2.1.0.10.2.0002"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nome(s) no Balancete
              </label>
              <input
                type="text"
                value={formContasDescricoes}
                onChange={(e) => setFormContasDescricoes(e.target.value)}
                placeholder="Ex: ALL AMERICA LATINA LOGISTICA"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Observação
              </label>
              <input
                type="text"
                value={formObservacao}
                onChange={(e) => setFormObservacao(e.target.value)}
                placeholder="Ex: Alteração societária"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelarForm}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Regra
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="py-2.5 px-4 font-semibold">Aba</th>
              <th className="py-2.5 px-4 font-semibold">Código(s) Relatório</th>
              <th className="py-2.5 px-4 font-semibold">Fornecedor(es) no Relatório</th>
              <th className="py-2.5 px-4 font-semibold">Conta(s) Contábil(is)</th>
              <th className="py-2.5 px-4 font-semibold">Descrição no Balancete</th>
              <th className="py-2.5 px-4 font-semibold">Observação</th>
              <th className="py-2.5 px-4 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {regras.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                  {r.aba === 'CAP' ? 'Contas a Pagar' : 'Pagamento Antecipado'}
                </td>
                <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">
                  {r.fornecedorKeys.join(' + ')}
                </td>
                <td className="py-2.5 px-4 text-slate-900">
                  {r.fornecedorNomes.join(' / ')}
                </td>
                <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">
                  {r.contasCodigos.join(' + ')}
                </td>
                <td className="py-2.5 px-4 text-slate-800">
                  {r.contasDescricoes.join(' / ')}
                </td>
                <td className="py-2.5 px-4 text-slate-500">
                  {r.observacao || '—'}
                </td>
                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => iniciarEdicao(r)}
                      className="p-1 text-slate-600 hover:text-slate-900 rounded cursor-pointer"
                      title="Editar vínculo"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRegra(r.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      title="Excluir vínculo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {regras.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  Nenhum vínculo manual salvo até o momento. Você pode criar vínculos diretamente nas abas &ldquo;Contas a Pagar&rdquo; ou &ldquo;Pagamento Antecipado&rdquo; clicando no ícone de corrente, ou pelo botão &ldquo;Novo Vínculo Manual&rdquo; acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
