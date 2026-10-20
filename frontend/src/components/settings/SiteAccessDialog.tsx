import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, RefreshCw, X } from 'lucide-react';
import { settingsApi, sitesApi, siteGroupsApi } from '../../services/api';
import clsx from 'clsx';

export interface UserSiteRole { site_id: number; site_name: string; role: string }
/** Access to every site in a group (#306). */
export interface UserGroupRole { group_id: number; group_name: string; role: string }

type Choice = '' | 'viewer' | 'operator' | 'admin';

/**
 * Choose where an account has access (outside review P1-7): the whole fleet
 * under its role, or particular groups and sites with a role in each. A group
 * role reaches every site in the group, including sites added to it later
 * (#306); a site reached both ways gets the higher role. A site admin can
 * change devices and trust their certificates in that site; fleet settings,
 * users and SSO stay with fleet admins.
 */
export default function SiteAccessDialog({
  user, isSelf, onClose,
}: {
  user: { id: number; username: string; role: string; site_roles?: UserSiteRole[]; group_roles?: UserGroupRole[] };
  isSelf: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const initial = new Map((user.site_roles ?? []).map((r) => [r.site_id, r.role as Choice]));
  const initialGroups = new Map((user.group_roles ?? []).map((r) => [r.group_id, r.role as Choice]));
  const [scoped, setScoped] = useState(initial.size > 0 || initialGroups.size > 0);
  const [roles, setRoles] = useState<Map<number, Choice>>(initial);
  const [groupRoles, setGroupRoles] = useState<Map<number, Choice>>(initialGroups);
  const [error, setError] = useState('');

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list().then((r) => r.data) });
  const { data: groups = [] } = useQuery({ queryKey: ['site-groups'], queryFn: () => siteGroupsApi.list().then((r) => r.data) });

  const save = useMutation({
    mutationFn: () => {
      const list = scoped
        ? [...roles.entries()].filter(([, r]) => r).map(([site_id, role]) => ({ site_id, role }))
        : [];
      const groupList = scoped
        ? [...groupRoles.entries()].filter(([, r]) => r).map(([group_id, role]) => ({ group_id, role }))
        : [];
      return settingsApi.updateUser(user.id, { site_roles: list, group_roles: groupList });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings-users'] }); onClose(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save'),
  });

  const chosen = [...roles.values()].filter(Boolean).length + [...groupRoles.values()].filter(Boolean).length;
  const set = (siteId: number, role: Choice) => setRoles((m) => new Map(m).set(siteId, role));
  const setGroup = (groupId: number, role: Choice) => setGroupRoles((m) => new Map(m).set(groupId, role));
  const roleSelect = (value: Choice | undefined, onChange: (r: Choice) => void) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value as Choice)}
      className={clsx('input py-1 text-xs w-32', !value && 'text-ink-4')}>
      <option value="">No access</option>
      <option value="viewer">Viewer</option>
      <option value="operator">Operator</option>
      <option value="admin">Admin</option>
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink flex items-center gap-2"><Globe className="w-4 h-4" /> Access for {user.username}</h3>
            <p className="text-xs text-ink-3 mt-1">Where this account can see and act, and with what role.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-2"><X className="w-4 h-4" /></button>
        </div>

        {isSelf ? (
          <p className="text-sm text-ink-2">
            You can&apos;t limit your own account to particular sites: you would lose fleet administration.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!scoped} onChange={() => setScoped(false)} className="mt-1" />
                <span>
                  <span className="font-medium text-ink">Whole fleet</span>
                  <span className="block text-xs text-ink-3">Every site, as <strong>{user.role}</strong> (the role set on the account).</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" checked={scoped} onChange={() => setScoped(true)} className="mt-1" />
                <span>
                  <span className="font-medium text-ink">{groups.length ? 'Specific groups and sites' : 'Specific sites'}</span>
                  <span className="block text-xs text-ink-3">
                    Only those below, with a role in each{groups.length ? '; a group covers every site in it, including ones added later' : ''}. Fleet settings, users, alerting and traffic analytics are not available.
                  </span>
                </span>
              </label>
            </div>

            {scoped && groups.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-xs text-ink-3">
                  <tr><th className="text-left font-medium py-1">Group</th><th className="text-right font-medium">Role</th></tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-t border-line-soft/50">
                      <td className="py-1.5 text-ink">
                        {g.name} <span className="text-xs text-ink-4">{g.site_ids.length} site{g.site_ids.length === 1 ? '' : 's'}</span>
                      </td>
                      <td className="py-1.5 text-right">{roleSelect(groupRoles.get(g.id), (r) => setGroup(g.id, r))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {scoped && (
              <table className="w-full text-sm">
                <thead className="text-xs text-ink-3">
                  <tr><th className="text-left font-medium py-1">Site</th><th className="text-right font-medium">Role</th></tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id} className="border-t border-line-soft/50">
                      <td className="py-1.5 text-ink">
                        {s.name}
                        {s.group_id != null && groupRoles.get(s.group_id) && (
                          <span className="text-xs text-ink-4"> · {groupRoles.get(s.group_id)} through {s.group_name}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">{roleSelect(roles.get(s.id), (r) => set(s.id, r))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {scoped && chosen === 0 && (
              <p className="text-xs text-warn">Choose at least one {groups.length ? 'group or site' : 'site'}, or pick Whole fleet.</p>
            )}
            {error && <p className="text-xs text-bad">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              <button onClick={() => save.mutate()} disabled={save.isPending || (scoped && chosen === 0)}
                className="btn-primary text-sm flex items-center gap-1.5">
                {save.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Save
              </button>
            </div>
            <p className="text-[11px] text-ink-4">Takes effect on the account&apos;s next request; it doesn&apos;t need to sign in again.</p>
          </>
        )}
      </div>
    </div>
  );
}
