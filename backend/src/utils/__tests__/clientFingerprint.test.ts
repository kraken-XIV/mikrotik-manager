import { fingerprintClient } from '../clientFingerprint';

describe('fingerprintClient', () => {
  it('classifies by vendor OUI', () => {
    expect(fingerprintClient({ vendor: 'Ubiquiti Inc' })).toBe('network');
    expect(fingerprintClient({ vendor: 'Routerboard.com' })).toBe('network');
    expect(fingerprintClient({ vendor: 'Proxmox Server Solutions GmbH' })).toBe('server');
    expect(fingerprintClient({ vendor: 'Espressif Inc.' })).toBe('iot');
    expect(fingerprintClient({ vendor: 'Walter Kidde Portable Equipment, Inc.' })).toBe(
      'smart-home',
    );
    expect(fingerprintClient({ vendor: 'Wyze Labs Inc' })).toBe('camera');
    expect(fingerprintClient({ vendor: 'Reolink Innovation Limited' })).toBe('camera');
    expect(fingerprintClient({ vendor: 'Amazon Technologies Inc.' })).toBe('voice-assistant');
    expect(fingerprintClient({ vendor: 'Nanoleaf' })).toBe('smart-home');
    expect(fingerprintClient({ vendor: 'Super Micro Computer, Inc.' })).toBe('server');
    expect(fingerprintClient({ vendor: 'Dell Inc.' })).toBe('computer');
  });

  it('hostname beats vendor (device identity > NIC maker)', () => {
    // LG Innotek NIC inside a webOS TV
    expect(
      fingerprintClient({ vendor: 'LG Innotek', hostname: 'LGwebOSTV.tracelength.home' }),
    ).toBe('tv');
    // Onkyo receiver with a LinkSprite NIC-alike hostname pattern
    expect(
      fingerprintClient({ vendor: 'Onkyo Technology K.K.', hostname: 'Onkyo-TX-NR575.home' }),
    ).toBe('media');
    // Apple defaults to phone, but a MacBook hostname reclassifies
    expect(fingerprintClient({ vendor: 'Apple, Inc.', hostname: 'ricks-macbook-pro' })).toBe(
      'computer',
    );
    expect(fingerprintClient({ vendor: 'Apple, Inc.', hostname: 'Ricks-iPhone' })).toBe('phone');
  });

  it('uses the custom name when hostname is missing', () => {
    expect(
      fingerprintClient({ vendor: 'IEEE Registration Authority', custom_name: 'Garage Camera 2' }),
    ).toBe('camera');
  });

  it('stays unknown rather than guessing', () => {
    expect(fingerprintClient({ vendor: 'Some Unheard Of Co' })).toBe('unknown');
    expect(fingerprintClient({})).toBe('unknown');
    expect(fingerprintClient({ vendor: null, hostname: null })).toBe('unknown');
  });
});
