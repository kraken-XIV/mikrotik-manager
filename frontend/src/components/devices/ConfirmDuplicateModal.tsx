import { AlertTriangle, GitMerge, RefreshCcw, X } from 'lucide-react';
import { useState } from 'react';

import type { DuplicateSerialError } from '../../services/api';

interface Props {
  duplicate: DuplicateSerialError;
  pendingName: string;
  pendingIp: string;
  onCancel: () => void;
  onCombine: () => void;
  onReplace: () => void;
  loading: boolean;
}

export default function ConfirmDuplicateModal({
  duplicate,
  pendingName,
  pendingIp,
  onCancel,
  onCombine,
  onReplace,
  loading,
}: Props) {
  const [confirmCombineStep, setConfirmCombineStep] = useState(false);
  // Replace moves the existing record (history, backups, snapshots) to the new
  // address, on the strength of a serial the new device merely reports. Two
  // steps, never the default button (outside review U7).
  const [confirmReplaceStep, setConfirmReplaceStep] = useState(false);
  const existingSerial = (duplicate.existing_device.serial_number || '').trim().toUpperCase();
  const candidateSerial = (duplicate.candidate.serial_number || '').trim().toUpperCase();
  const serialsMatch = Boolean(
    existingSerial && candidateSerial && existingSerial === candidateSerial,
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-xl mx-4">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warn" />
            Duplicate serial detected
          </h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 rounded text-ink-4 hover:text-ink-2 dark:hover:text-ink-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-2">
            Serial <span className="font-mono">{duplicate.candidate.serial_number}</span> already
            exists on a managed device.
          </p>
          {confirmCombineStep && (
            <div className="rounded-lg border border-warn bg-warn-bg dark:border-warn p-3">
              <p className="text-sm font-medium text-warn dark:text-warn mb-1">Confirm combine</p>
              <p className="text-xs text-warn dark:text-amber-300/90">
                Existing serial:{' '}
                <span className="font-mono">{duplicate.existing_device.serial_number}</span>
              </p>
              <p className="text-xs text-warn dark:text-amber-300/90">
                New device serial:{' '}
                <span className="font-mono">{duplicate.candidate.serial_number}</span>
              </p>
              <p className="text-xs text-warn dark:text-amber-300/90 mt-2">
                Only continue if you are certain these represent the same physical device.
              </p>
              {!serialsMatch && (
                <p className="text-xs font-semibold text-bad dark:text-bad mt-2">
                  Combine is disabled because the serial numbers do not match.
                </p>
              )}
            </div>
          )}
          {confirmReplaceStep && (
            <div className="rounded-lg border border-bad bg-bad-bg dark:border-bad p-3 text-xs text-bad dark:text-bad space-y-1">
              <p className="text-sm font-medium">Confirm replace</p>
              <p>
                <span className="font-medium">{duplicate.existing_device.name}</span>&apos;s record,
                with its history, backups and config snapshots, will move from{' '}
                <span className="font-mono">{duplicate.existing_device.ip_address}</span> to{' '}
                <span className="font-mono">{pendingIp}</span>.
              </p>
              <p>
                The serial is only what the new device reports. Continue only if you know the device
                at {pendingIp} is that device (moved or re-addressed). A copied or misconfigured
                device can report any serial.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs uppercase tracking-wide text-ink-3">Existing managed device</p>
              <p className="text-sm font-medium text-ink">{duplicate.existing_device.name}</p>
              <p className="text-xs text-ink-3">{duplicate.existing_device.ip_address}</p>
              <p className="text-xs text-ink-3 font-mono mt-1">
                Serial: {duplicate.existing_device.serial_number}
              </p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs uppercase tracking-wide text-ink-3">New device request</p>
              <p className="text-sm font-medium text-ink">{pendingName}</p>
              <p className="text-xs text-ink-3">{pendingIp}</p>
              <p className="text-xs text-ink-3 font-mono mt-1">
                Serial: {duplicate.candidate.serial_number}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">
              Cancel
            </button>
            {confirmCombineStep ? (
              <button
                type="button"
                onClick={onCombine}
                disabled={loading || !serialsMatch}
                className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitMerge className="w-4 h-4" />
                Confirm combine now
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCombineStep(true)}
                disabled={loading}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <GitMerge className="w-4 h-4" />
                Continue to combine check
              </button>
            )}
            {confirmReplaceStep ? (
              <button
                type="button"
                onClick={onReplace}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-bad hover:bg-bad text-white disabled:opacity-50"
              >
                <RefreshCcw className="w-4 h-4" />
                Yes, move the record
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReplaceStep(true)}
                disabled={loading}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                Replace existing details…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
