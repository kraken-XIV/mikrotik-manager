import { useCanWrite } from '../hooks/useCanWrite';
import { useState } from 'react';
import type { Device } from '../types';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Terminal, AlertTriangle, Play, ShieldCheck, ChevronDown, ChevronRight, Ban, Download } from 'lucide-react';
import { commandsApi, devicesApi, type CommandRunDetail, tagsApi} from '../services/api';
import CommandTemplateBar from '../components/commands/CommandTemplateBar';
import DevicePicker from '../components/devices/DevicePicker';

/**
 * Bulk command execution.
 *
 * The controls here are the feature. A shell loop already runs a command on many
 * hosts; what it cannot do is stop after the first wave once it becomes clear the
 * command was wrong. Wave size and halt-on-failure are therefore prominent, and
 * the guards default on — with a single deliberate switch to turn them off,
 * because a tool that refuses to cut is not a sharp tool (#118).
 */

/**
 * Pull the CSV through the authenticated client and hand it to the browser.
 *
 * A plain download link cannot carry the Bearer header, so it would 401.
 */
async function downloadCsv(runId: number): Promise<void> {
  const res = await commandsApi.exportCsv(runId);
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `command-run-${runId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CommandsPage() {
  const queryClient = useQueryClient();
  const [command, setCommand] = useState('');
  // Run from the Templates page arrives as /commands?template=ID.
  const [searchParams] = useSearchParams();
  const initialTemplateId = Number(searchParams.get('template')) || null;
  const [selected, setSelected] = useState<number[]>([]);

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list().then(r => r.data),
  });
  const [waveSize, setWaveSize] = useState(1);
  const [haltOnFailure, setHaltOnFailure] = useState(true);
  const [useGuard, setUseGuard] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const canWrite = useCanWrite();
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then(r => r.data),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['command-runs'],
    queryFn: () => commandsApi.listRuns().then(r => r.data),
    refetchInterval: 5_000,
  });

  const { data: detail } = useQuery<CommandRunDetail>({
    queryKey: ['command-run', openRun],
    queryFn: () => commandsApi.getRun(openRun!).then(r => r.data),
    enabled: openRun != null,
    refetchInterval: 3_000,
  });

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['command-preview', command, selected, waveSize],
    queryFn: () => commandsApi.preview(command, selected, waveSize).then(r => r.data),
    enabled: command.trim().length > 0 && selected.length > 0,
  });

  const startRun = useMutation({
    meta: { inlineError: true },
    mutationFn: () => commandsApi.createRun({
      name: command.slice(0, 60), command, device_ids: selected,
      wave_size: waveSize, halt_on_failure: haltOnFailure,
      use_change_guard: useGuard, start: true,
      // The server checks this too (U3).
      acknowledge_risk: acknowledged,
    }),
    onSuccess: (r) => {
      setOpenRun(r.data.id);
      setAcknowledged(false);
      queryClient.invalidateQueries({ queryKey: ['command-runs'] });
    },
  });


  const risky = preview?.risky ?? false;
  // Guards off on a command that can sever management is the one combination
  // worth insisting the operator states out loud.
  const needsAck = risky && !useGuard;
  const sshOnlySelected = (devices as Device[]).filter((d) => d.ssh_only && selected.includes(d.id));
  // Not until the preview for exactly this command is in: running ahead of it
  // skipped the risk check and its acknowledgement (outside review U3).
  const previewCurrent = !!preview && !previewLoading && preview.command === command;
  // Running needs write access on the server (U10).
  const canRun = canWrite && command.trim() && selected.length > 0 && previewCurrent && (!needsAck || acknowledged) && !startRun.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent" /> Bulk commands
        </h1>
        <p className="text-sm text-ink-2 mt-1 max-w-3xl">
          Run RouterOS console commands across many devices, in waves, stopping at the first
          failure. Put several commands on separate lines to run them in order. Commands run over
          SSH, so console syntax such as <code>:put</code> works.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <CommandTemplateBar command={command} onLoad={setCommand} initialTemplateId={initialTemplateId} />
        <label className="block">
          <span className="text-sm font-medium text-ink-2">Command</span>
          <textarea
            value={command} onChange={e => setCommand(e.target.value)}
            rows={4} spellCheck={false}
            placeholder="/system note set note=&quot;maintenance window&quot;"
            className="input mt-1 w-full font-mono text-sm"
          />
        </label>

        {risky && (
          <div className="flex gap-2 rounded-lg border border-warn bg-warn-bg p-3 text-xs dark:border-warn dark:bg-warn-bg">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warn" />
            <div className="text-warn dark:text-warn">
              <div className="font-medium">This command can cut management access.</div>
              <ul className="mt-1 list-disc list-inside">
                {preview?.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <p className="mt-1">
                It is not blocked — you may know exactly why you are running it. With Change Guard on,
                a device that stops answering afterwards restores itself.
              </p>
            </div>
          </div>
        )}

        {/* Devices */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink-2">
              Devices {selected.length > 0 && `(${selected.length} selected)`}
            </span>
            <div className="flex gap-2 text-xs items-center flex-wrap">
              <button className="underline text-accent"
                      onClick={() => setSelected(devices.map(d => d.id))}>All</button>
              <button className="underline text-accent"
                      onClick={() => setSelected([])}>None</button>
              {/* Selecting by tag is what makes a tag worth having: it is the one
                  grouping that crosses sites and device types, and until now
                  nothing consumed it (#149). */}
              {tags.filter(t => devices.some(d => d.tags?.some(dt => dt.id === t.id))).map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelected(devices.filter(d => d.tags?.some(dt => dt.id === t.id)).map(d => d.id))}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: `${t.color}22`, color: t.color }}
                  title={`Select every device tagged ${t.name}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <DevicePicker devices={devices} selected={selected} onChange={setSelected} />
        </div>

        {/* The controls that make this different from a shell loop */}
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs">
            <span className="text-ink-3">Devices per wave</span>
            <input type="number" min={1} max={50} value={waveSize}
                   onChange={e => setWaveSize(Math.max(1, Number(e.target.value) || 1))}
                   className="input mt-1 w-full text-sm" />
            <span className="text-[11px] text-ink-3">
              {preview ? `${preview.waves} wave${preview.waves === 1 ? '' : 's'}` : 'Start small.'}
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs pt-5">
            <input type="checkbox" checked={haltOnFailure} onChange={e => setHaltOnFailure(e.target.checked)} />
            <span className="text-ink-2">
              Stop at the first failure
              <span className="block text-[11px] text-ink-3">
                The reason to run this here rather than in a loop.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs pt-5">
            <input type="checkbox" checked={useGuard} onChange={e => setUseGuard(e.target.checked)} />
            <span className="text-ink-2">
              Change Guard
              <span className="block text-[11px] text-ink-3">
                A device that stops answering restores itself.
              </span>
            </span>
          </label>
        </div>

        {/* Change Guard arms over the API, which an SSH-only device lacks (#174). */}
        {useGuard && sshOnlySelected.length > 0 && (
          <p className="text-xs rounded-lg border border-warn bg-warn-bg p-3 text-warn dark:border-warn dark:bg-warn-bg dark:text-warn">
            {sshOnlySelected.length === 1 ? `${sshOnlySelected[0].name.trim()} was` : `${sshOnlySelected.length} selected devices were`} added
            over SSH only. Change Guard needs the RouterOS API, so with it on {sshOnlySelected.length === 1 ? 'that device fails' : 'they fail'}.
            To turn the API on (<span className="mono">/ip service enable api-ssl</span>), run without Change Guard.
          </p>
        )}

        {needsAck && (
          <label className="flex items-start gap-2 text-xs rounded-lg border border-bad bg-bad-bg p-3 dark:border-red-700/60 dark:bg-bad-bg">
            <input type="checkbox" className="mt-0.5" checked={acknowledged}
                   onChange={e => setAcknowledged(e.target.checked)} />
            <span className="text-bad dark:text-bad">
              I am running a command that can cut management access, with Change Guard off. If a
              device becomes unreachable it will stay that way until someone attends to it physically.
            </span>
          </label>
        )}

        <div className="flex items-center gap-3">
          <button className="btn-primary text-sm flex items-center gap-2"
                  disabled={!canRun} onClick={() => startRun.mutate()}>
            <Play className="w-4 h-4" />
            {startRun.isPending ? 'Starting…' : `Run on ${selected.length || 0} device${selected.length === 1 ? '' : 's'}`}
          </button>
          {preview?.unreachable && preview.unreachable.length > 0 && (
            <span className="text-xs text-warn">
              {preview.unreachable.length} selected device(s) have no SSH credential and will fail.
            </span>
          )}
          {startRun.isError && (
            <span className="text-xs text-bad">
              {(startRun.error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not start'}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink-2 dark:text-ink">Recent runs</h2>
        </div>
        {runs.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Nothing run yet.</div>
        ) : (
          <div className="divide-y divide-line-soft dark:divide-line-soft">
            {runs.map(r => (
              <div key={r.id}>
                <button className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-surface-2/40"
                        onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>
                  {openRun === r.id ? <ChevronDown className="w-4 h-4 text-ink-4" /> : <ChevronRight className="w-4 h-4 text-ink-4" />}
                  <span className="font-mono text-xs text-ink truncate flex-1">{r.command}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    r.status === 'completed' ? 'bg-good-bg text-good dark:bg-good-bg dark:text-good'
                    : r.status === 'running' ? 'bg-accent-soft text-accent dark:bg-accent-soft dark:text-accent'
                    : 'bg-warn-bg text-warn dark:bg-warn-bg dark:text-warn'}`}>{r.status}</span>
                  <span className="text-xs text-ink-3 tabular-nums">
                    {r.succeeded}/{r.total}
                  </span>
                </button>

                {openRun === r.id && detail && (
                  <div className="px-5 pb-3 space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                      {detail.status === 'running' && (
                        <button className="btn-secondary text-xs flex items-center gap-1.5"
                                onClick={() => commandsApi.cancelRun(r.id)}>
                          <Ban className="w-3.5 h-3.5" /> Stop before next wave
                        </button>
                      )}
                      {/* Requested on #118 for archiving and audit. */}
                      <button className="btn-secondary text-xs flex items-center gap-1.5"
                              onClick={() => downloadCsv(r.id)}>
                        <Download className="w-3.5 h-3.5" /> Export CSV
                      </button>
                    </div>
                    {detail.devices.map(d => (
                      <div key={d.id} className="text-xs border-b border-line-soft dark:border-line-soft last:border-0 py-1.5">
                        <button className="flex items-center gap-2 w-full text-left"
                                onClick={() => setExpanded(e => ({ ...e, [d.id]: !e[d.id] }))}>
                          <span className="text-ink-4 w-12">wave {d.wave}</span>
                          <span className="text-ink flex-1 truncate">{d.device_name.trim()}</span>
                          {d.guarded && <ShieldCheck className="w-3 h-3 text-ink-4" />}
                          <span className={
                            d.status === 'success' ? 'text-good'
                            : d.status === 'skipped' ? 'text-ink-4'
                            : 'text-bad'}>{d.status}</span>
                        </button>
                        {expanded[d.id] && (
                          <pre className="mt-1 ml-14 whitespace-pre-wrap break-words text-[11px] text-ink-2">
                            {d.error ? `${d.error}\n` : ''}{d.output || (d.status === 'success' ? '(no output)' : '')}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
