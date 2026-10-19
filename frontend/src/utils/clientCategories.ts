import {
  Network,
  Server,
  Monitor,
  Smartphone,
  Tv,
  Speaker,
  Camera,
  Printer,
  Gamepad2,
  Mic,
  Home,
  Cpu,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

// Device categories (must match the backend's DEVICE_CATEGORIES)
export const CATEGORY_META: Record<string, { icon: LucideIcon; label: string }> = {
  network: { icon: Network, label: 'Network gear' },
  server: { icon: Server, label: 'Server / NAS' },
  computer: { icon: Monitor, label: 'Computer' },
  phone: { icon: Smartphone, label: 'Phone / tablet' },
  tv: { icon: Tv, label: 'TV / streaming' },
  media: { icon: Speaker, label: 'AV / speaker' },
  camera: { icon: Camera, label: 'Camera' },
  printer: { icon: Printer, label: 'Printer' },
  'game-console': { icon: Gamepad2, label: 'Game console' },
  'voice-assistant': { icon: Mic, label: 'Voice assistant' },
  'smart-home': { icon: Home, label: 'Smart home' },
  iot: { icon: Cpu, label: 'IoT device' },
  unknown: { icon: HelpCircle, label: 'Unknown' },
};

/** Categories a user can pick when overriding (same order as the meta map). */
export const SELECTABLE_CATEGORIES = Object.keys(CATEGORY_META);
