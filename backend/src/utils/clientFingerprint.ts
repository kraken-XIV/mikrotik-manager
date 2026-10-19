// Client device fingerprinting — classifies a client into a device category
// from its OUI vendor string, hostname, and connection type. Rule-based and
// deliberately conservative: hostname patterns (most specific) win over vendor
// keywords; unknown stays unknown rather than guessing.

export const DEVICE_CATEGORIES = [
  'network', // routers, switches, APs
  'server', // hypervisors, NAS, home-automation hubs
  'computer', // laptops/desktops
  'phone', // phones & tablets
  'tv', // TVs, streaming boxes
  'media', // AV receivers, speakers
  'camera', // IP cameras, doorbells
  'printer',
  'game-console',
  'voice-assistant',
  'smart-home', // thermostats, lights, plugs, sleep tech, safety sensors
  'iot', // generic embedded (ESP32 etc.)
  'unknown',
] as const;

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

interface Rule {
  pattern: RegExp;
  category: DeviceCategory;
}

// Hostname rules — checked first (a hostname names the actual device, while a
// NIC vendor names whoever made the radio).
const HOSTNAME_RULES: Rule[] = [
  { pattern: /iphone|ipad|android|pixel|galaxy|oneplus|redmi/i, category: 'phone' },
  {
    pattern: /macbook|imac|mac-?mini|thinkpad|laptop|desktop|-pc\b|win(dows|1[01])|surface/i,
    category: 'computer',
  },
  {
    pattern: /appletv|apple-tv|chromecast|roku|firetv|fire-tv|shield|webos|bravia|-tv\b|tv\./i,
    category: 'tv',
  },
  { pattern: /\bcam(era)?s?\b|cam[-._\d]|doorbell|reolink|wyze|ring-|arlo/i, category: 'camera' },
  { pattern: /printer|officejet|laserjet|deskjet|epson|brother[-_]/i, category: 'printer' },
  { pattern: /ps[45]|playstation|xbox|nintendo/i, category: 'game-console' },
  {
    pattern: /echo[-_]|alexa|homepod|google-?home|nest-?mini|nest-?hub/i,
    category: 'voice-assistant',
  },
  { pattern: /sonos|denon|onkyo|yamaha|receiver|soundbar|onelink|speaker/i, category: 'media' },
  {
    pattern: /thermostat|hue|lifx|nanoleaf|plug|switchbot|tasmota|shelly|sensor/i,
    category: 'smart-home',
  },
  { pattern: /esp[-_]?\d|esp32|esp8266/i, category: 'iot' },
  {
    pattern: /proxmox|truenas|synology|unraid|nas\b|server|homeassistant|home-assistant|hassio/i,
    category: 'server',
  },
  {
    pattern: /router|switch|gateway|firewall|-ap\b|accesspoint|unifi|mikrotik/i,
    category: 'network',
  },
];

// Vendor (OUI) rules — fallback when the hostname doesn't identify the device.
const VENDOR_RULES: Rule[] = [
  {
    pattern:
      /ubiquiti|routerboard|mikrotik|cisco|netgear|aruba|juniper|zyxel|d-link|fortinet|ruckus|extreme networks/i,
    category: 'network',
  },
  {
    pattern: /proxmox|vmware|super micro|supermicro|qnap|synology|nutanix|nabu casa/i,
    category: 'server',
  },
  {
    pattern: /reolink|wyze|hikvision|dahua|axis communications|ring llc|arlo|eufy|ubnt.*cam/i,
    category: 'camera',
  },
  { pattern: /espressif|tuya|sonoff|itead|shelly|allterco|particle|nordic semi/i, category: 'iot' },
  {
    pattern:
      /walter kidde|first alert|nest labs|ecobee|honeywell|nanoleaf|signify|philips lighting|lifx|eight sleep|lutron|leviton|wemo|belkin/i,
    category: 'smart-home',
  },
  { pattern: /lg innotek|lg electronics|vizio|tcl|hisense|roku|sceptre/i, category: 'tv' },
  { pattern: /onkyo|sonos|denon|yamaha|bose|harman|bang & olufsen|linksprite/i, category: 'media' },
  { pattern: /sony interactive|nintendo|microsoft.*xbox/i, category: 'game-console' },
  {
    pattern: /hewlett[- ]packard|\bhp inc|canon|epson|brother industries|lexmark|xerox/i,
    category: 'printer',
  },
  { pattern: /raspberry pi/i, category: 'server' },
  {
    pattern:
      /intel corporate|asustek|micro-star|gigabyte|dell inc|lenovo|framework|hon hai|azurewave|realtek|liteon|clevo/i,
    category: 'computer',
  },
  {
    pattern: /samsung electro|xiaomi|huawei|oneplus|oppo|vivo mobile|motorola mobility/i,
    category: 'phone',
  },
  { pattern: /^apple/i, category: 'phone' }, // most Apple clients on a LAN are iPhones/iPads; hostname rules catch Macs
  { pattern: /amazon technologies/i, category: 'voice-assistant' }, // echoes & fire devices dominate Amazon OUIs
  { pattern: /google/i, category: 'smart-home' }, // nest/chromecast; hostname rules catch specific types
  { pattern: /texas instruments/i, category: 'iot' },
];

export function fingerprintClient(input: {
  vendor?: string | null;
  hostname?: string | null;
  custom_name?: string | null;
}): DeviceCategory {
  // Hostname first (also consider the user-assigned name — users name things truthfully)
  for (const source of [input.hostname, input.custom_name]) {
    const h = (source || '').trim();
    if (!h) continue;
    for (const rule of HOSTNAME_RULES) {
      if (rule.pattern.test(h)) return rule.category;
    }
  }
  const v = (input.vendor || '').trim();
  if (v) {
    for (const rule of VENDOR_RULES) {
      if (rule.pattern.test(v)) return rule.category;
    }
  }
  return 'unknown';
}
