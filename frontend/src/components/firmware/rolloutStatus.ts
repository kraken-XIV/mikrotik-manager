/** Badge styles for firmware rollouts and their devices. */

export const ITEM_STATUS: Record<string, { label: string; cls: string; spin?: boolean }> = {
  pending: {
    label: 'Pending',
    cls: 'bg-surface-3 text-ink-3',
  },
  backing_up: {
    label: 'Backing up',
    cls: 'bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent',
    spin: true,
  },
  upgrading: {
    label: 'Upgrading',
    cls: 'bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet',
    spin: true,
  },
  rebooting: {
    label: 'Rebooting',
    cls: 'bg-warn-bg dark:bg-warn-bg text-warn',
    spin: true,
  },
  // Set by the RouterBOOT step; without it the badge fell back to "Pending" (#262).
  routerboot: {
    label: 'RouterBOOT',
    cls: 'bg-violet-bg dark:bg-violet-bg text-violet dark:text-violet',
    spin: true,
  },
  verifying: {
    label: 'Verifying',
    cls: 'bg-info-bg dark:bg-info-bg text-info dark:text-info',
    spin: true,
  },
  post_commands: {
    label: 'Running commands',
    cls: 'bg-info-bg dark:bg-info-bg text-info dark:text-info',
    spin: true,
  },
  success: {
    label: 'Success',
    cls: 'bg-good-bg text-good',
  },
  failed: { label: 'Failed', cls: 'bg-bad-bg text-bad dark:text-bad' },
  skipped: {
    label: 'Skipped',
    cls: 'bg-surface-3 text-ink-3',
  },
};

export const ROLLOUT_STATUS: Record<string, string> = {
  pending: 'bg-surface-3 text-ink-2',
  running: 'bg-accent-soft dark:bg-accent-soft text-accent dark:text-accent',
  completed: 'bg-good-bg text-good',
  failed: 'bg-bad-bg text-bad dark:text-bad',
  cancelled: 'bg-surface-3 text-ink-3',
  missed: 'bg-warn-bg dark:bg-warn-bg text-warn dark:text-warn',
};
