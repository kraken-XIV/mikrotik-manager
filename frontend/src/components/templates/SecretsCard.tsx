import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Trash2, Copy } from 'lucide-react';
import { commandSecretsApi } from '../../services/api';

/**
 * Secret values for commands (#259), fleet admins only. A command uses one as
 * {{secret:name}}; the value is filled in on the server when it runs and is
 * never shown again, here or anywhere else.
 */
export default function SecretsCard() {
  const qc = useQueryClient();
  const { data: secrets = [] } = useQuery({ queryKey: ['command-secrets'], queryFn: () => commandSecretsApi.list().then((r) => r.data) });
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const save = useMutation({
    mutationFn: (generate: boolean) => commandSecretsApi.save(generate ? { name: name.trim(), generate: true } : { name: name.trim(), value }),
    onSuccess: () => { setName(''); setValue(''); setError(''); qc.invalidateQueries({ queryKey: ['command-secrets'] }); },
    onError: (e: unknown) => setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Couldn’t save'),
  });
  const remove = useMutation({
    mutationFn: (n: string) => commandSecretsApi.remove(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['command-secrets'] }),
  });
  const ref = (n: string) => `{{secret:${n}}}`;
  const copy = (n: string) => { void navigator.clipboard?.writeText(ref(n)); setCopied(n); setTimeout(() => setCopied(''), 1500); };
  const replacing = secrets.some((s) => s.name === name.trim());

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h2 className="font-semibold text-ink flex items-center gap-2"><KeyRound className="w-4 h-4 text-warn" /> Secrets</h2>
        <p className="text-xs text-ink-3 mt-1">
          For a password in a command, such as creating a dedicated user for the manager. Write{' '}
          <code className="font-mono">{'{{secret:name}}'}</code> in a template or bulk command and the value is filled in on the
          server when it runs. It never shows: not in the command, its history, its output or the logs. Only fleet admins can
          run commands that use secrets.
        </p>
      </div>
      {secrets.length > 0 && (
        <div className="divide-y divide-line border border-line rounded-lg">
          {secrets.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <code className="font-mono text-ink">{ref(s.name)}</code>
              <span className="text-xs text-ink-4 flex-1">changed {new Date(s.updated_at).toLocaleDateString()}{s.created_by ? ` · added by ${s.created_by}` : ''}</span>
              <button className="text-xs text-accent hover:underline flex items-center gap-1" onClick={() => copy(s.name)}>
                <Copy className="w-3 h-3" />{copied === s.name ? 'Copied' : 'Copy'}
              </button>
              <button className="text-xs text-bad hover:underline flex items-center gap-1"
                onClick={() => { if (window.confirm(`Delete secret ${s.name}? Commands that use it will stop running until it's added again.`)) remove.mutate(s.name); }}>
                <Trash2 className="w-3 h-3" />Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
        <input className="input text-sm" placeholder="Name, e.g. mtm_password" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input text-sm" type="password" autoComplete="new-password" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-primary text-sm" disabled={!name.trim() || !value || save.isPending} onClick={() => save.mutate(false)}>
          {replacing ? 'Replace' : 'Save'}
        </button>
        <button className="btn-secondary text-sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(true)}
          title="A random 24-character value, created on the server and never shown">
          Generate
        </button>
      </div>
      {replacing && <p className="text-xs text-warn">A secret with this name exists; saving replaces its value.</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
