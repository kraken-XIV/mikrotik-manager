import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, Building2, Hash, FileText, Pencil, Check, X, RefreshCw, AlertCircle,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { devicesApi, settingsApi, sitesApi } from '../../services/api';
import type { Device } from '../../types';
import { useCanWrite } from '../../hooks/useCanWrite';
import { geocodeAddress, OSM_TILE_URL, OSM_ATTRIBUTION } from '../../utils/geocode';
import { escapeHtml } from '../../utils/escapeHtml';
import { Network } from 'lucide-react';

interface Props {
  device: Device;
}

interface LocationForm {
  location_address: string;
  rack_name: string;
  rack_slot: string;
  notes: string;
}

function MapEmbed({ lat, lng, address }: { lat: number | string; lng: number | string; address: string }) {
  const latN = Number(lat);
  const lngN = Number(lng);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION }).addTo(map);
    L.circleMarker([latN, lngN], {
      radius: 9, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.9,
    }).bindPopup(`<b>${escapeHtml(address)}</b>`).addTo(map);
    map.setView([latN, lngN], 15);
    return () => { map.remove(); };
  }, [latN, lngN, address]);

  return (
    <div className="card overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <MapPin className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold text-ink flex-1 truncate">
          {address}
        </h3>
        <a
          href={`https://www.openstreetmap.org/?mlat=${latN}&mlon=${lngN}#map=16/${latN}/${lngN}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:text-accent whitespace-nowrap"
        >
          Open map ↗
        </a>
      </div>
      <div ref={containerRef} style={{ height: 280, isolation: 'isolate' }} />
    </div>
  );
}

export default function DeviceLocationSection({ device }: Props) {
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  // Geocoding and tiles are third-party requests that also disclose where your
  // devices are. Operators on isolated networks can turn the whole thing off
  // (issue #106); coordinates already stored are still shown as plain text.
  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => settingsApi.get().then(r => r.data),
    staleTime: 300_000,
  });
  // Off until settings have loaded (outside review U6): unknown used to count as on,
  // so a Dark Site install fetched map tiles and geocoding before, or without, the setting.
  const mapsEnabled = settings !== undefined && settings['maps_enabled'] !== false;

  // Which site this device belongs to (issue #130). Shown only when more than
  // one site exists — on a single-network install it is noise.
  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list().then((r) => r.data),
    staleTime: 60_000,
  });
  const showSitePicker = sites.length > 1;
  const currentSite = sites.find((s) => s.id === device.site_id) ?? null;

  const moveSite = useMutation({
    mutationFn: (siteId: number) => sitesApi.assignDevices(siteId, [device.id]),
    onSuccess: () => {
      // The device may have just left the site being viewed, so every scoped
      // figure on screen is now potentially wrong. Invalidate everything and
      // let the active queries refetch.
      queryClient.invalidateQueries();
    },
  });
  const [editing, setEditing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<LocationForm>({
    location_address: device.location_address ?? '',
    rack_name: device.rack_name ?? '',
    rack_slot: device.rack_slot ?? '',
    notes: device.notes ?? '',
  });

  // Shown location: the device's own, or its site's when it has none (#167).
  const effective = device.effective_location ?? null;
  const inherited = effective?.source === 'site';
  const siteAddress = currentSite?.address?.trim() || '';
  const hasMap = effective?.lat != null && effective?.lng != null;

  const mutation = useMutation({
    mutationFn: async (f: LocationForm) => {
      setSaveError('');
      let lat: number | null = device.location_lat ?? null;
      let lng: number | null = device.location_lng ?? null;

      // Re-geocode if address changed
      const addressChanged = f.location_address !== (device.location_address ?? '');
      if (mapsEnabled && f.location_address && addressChanged) {
        setGeocoding(true);
        const coords = await geocodeAddress(f.location_address);
        setGeocoding(false);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        } else {
          lat = null;
          lng = null;
        }
      }
      // Clear coords if address was cleared
      if (!f.location_address) { lat = null; lng = null; }

      return devicesApi.patchLocation(device.id, {
        location_address: f.location_address || null,
        location_lat:     lat,
        location_lng:     lng,
        rack_name:        f.rack_name || null,
        rack_slot:        f.rack_slot || null,
        notes:            f.notes    || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', device.id] });
      setEditing(false);
    },
    onError: (err: unknown) => {
      setGeocoding(false);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSaveError(msg || 'Failed to save');
    },
  });

  const openEdit = () => {
    setForm({
      location_address: device.location_address ?? '',
      rack_name: device.rack_name ?? '',
      rack_slot: device.rack_slot ?? '',
      notes: device.notes ?? '',
    });
    setSaveError('');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(''); };

  const isPending = mutation.isPending || geocoding;

  return (
    <div className={`grid gap-4 ${hasMap && !editing ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
      {/* Info / edit card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink">Physical Details</h3>
          {canWrite && !editing && (
            <button onClick={openEdit} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            {showSitePicker && (
              <div>
                <label className="label flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-accent" /> Site
                </label>
                <select
                  className="input"
                  value={device.site_id ?? ''}
                  disabled={moveSite.isPending}
                  onChange={(e) => {
                    const id = parseInt(e.target.value, 10);
                    if (Number.isInteger(id)) moveSite.mutate(id);
                  }}
                >
                  {device.site_id == null && <option value="">Unassigned</option>}
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <p className="text-xs text-ink-4 mt-1">
                  Moving a device takes its clients, events and history with it. Applies immediately.
                </p>
              </div>
            )}
            <div>
              <label className="label flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-accent" /> Physical Location
              </label>
              <input
                className="input"
                value={form.location_address}
                onChange={(e) => setForm((f) => ({ ...f, location_address: e.target.value }))}
                placeholder={siteAddress ? `From site: ${siteAddress}` : '123 Main St, City, State 00000'}
              />
              <p className="text-xs text-ink-4 mt-1">
                {siteAddress
                  ? <>Leave blank to use the site&apos;s address. Only set this if the device is somewhere else.{' '}</>
                  : null}
                {mapsEnabled ? 'An address entered here is geocoded and shown on the map.' : ''}
              </p>
              {siteAddress && form.location_address && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, location_address: '' }))}
                  className="text-xs text-accent hover:underline mt-1"
                >
                  Use the site&apos;s address instead
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-accent" /> Rack Name
                </label>
                <input
                  className="input"
                  value={form.rack_name}
                  onChange={(e) => setForm((f) => ({ ...f, rack_name: e.target.value }))}
                  placeholder="Rack-A1"
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-accent" /> Rack Slot
                </label>
                <input
                  className="input"
                  value={form.rack_slot}
                  onChange={(e) => setForm((f) => ({ ...f, rack_slot: e.target.value }))}
                  placeholder="U3"
                />
              </div>
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accent" /> Notes
              </label>
              <textarea
                className="input resize-none"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any relevant notes about this device..."
              />
            </div>

            {saveError && (
              <div className="flex items-start gap-2 p-3 bg-bad-bg border border-bad dark:border-bad rounded-lg">
                <AlertCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" />
                <p className="text-sm text-bad">{saveError}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => mutation.mutate(form)}
                disabled={isPending}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {isPending
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />{geocoding ? 'Geocoding…' : 'Saving…'}</>
                  : <><Check className="w-3.5 h-3.5" />Save</>
                }
              </button>
              <button onClick={cancelEdit} disabled={isPending} className="btn-secondary text-sm">
                <X className="w-3.5 h-3.5 inline mr-1" />Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {showSitePicker && (
              <InfoRow icon={<Network className="w-3.5 h-3.5 text-accent" />} label="Site"
                value={currentSite?.name}
                emptyText="Unassigned" />
            )}
            <InfoRow icon={<MapPin className="w-3.5 h-3.5 text-accent" />} label="Location"
              value={effective?.address ?? undefined}
              hint={inherited ? 'From site' : undefined}
              emptyText="No location set" />
            <InfoRow icon={<Building2 className="w-3.5 h-3.5 text-accent" />} label="Rack"
              value={device.rack_name}
              emptyText="No rack assigned" />
            <InfoRow icon={<Hash className="w-3.5 h-3.5 text-accent" />} label="Rack Slot"
              value={device.rack_slot}
              emptyText="—" />
            <div className="pt-1 border-t border-line-soft">
              <div className="flex items-start gap-2 mt-2">
                <FileText className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                <div className="flex-1">
                  <span className="text-xs font-medium text-ink-3 uppercase tracking-wide block mb-1">Notes</span>
                  {device.notes
                    ? <p className="text-ink-2 whitespace-pre-wrap leading-relaxed">{device.notes}</p>
                    : <p className="text-ink-3 italic">No notes</p>
                  }
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map card — only when we have coordinates, are not editing, and outbound
          map requests are permitted. */}
      {hasMap && !editing && mapsEnabled && (
        <MapEmbed
          lat={effective!.lat!}
          lng={effective!.lng!}
          address={effective!.address ?? ''}
        />
      )}
    </div>
  );
}

function InfoRow({
  icon, label, value, emptyText, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  emptyText: string;
  /** Small note after the value, e.g. where it came from. */
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-ink-3 uppercase tracking-wide block mb-0.5">
          {label}
        </span>
        {value
          ? <span className="text-ink">{value}</span>
          : <span className="text-ink-3 italic">{emptyText}</span>
        }
        {value && hint && (
          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-surface-3 text-ink-3">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
