import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom implements neither layout nor scrolling, but components legitimately
// ask for them (e.g. DevicePicker keeps the active option in view). Give every
// DOM test a quiet no-op; a test that cares about the call can spy on it.
// (Setup runs for node-environment files too, where Element doesn't exist.)
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// @testing-library/react only registers automatic cleanup when test globals
// are on; this suite imports every testing helper explicitly, so cleanup is
// wired here instead. In node-environment files there is nothing mounted and
// this is a no-op.
afterEach(() => {
  cleanup();
});
