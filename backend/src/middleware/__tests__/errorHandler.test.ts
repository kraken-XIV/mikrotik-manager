import { errorHandler } from '../errorHandler';

it('logs attacker-controlled paths and errors only as sanitized arguments, never a format string', () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = { headersSent: true };
  errorHandler(
    new Error('bad\r\nFORGED'),
    { method: 'GET', path: '/attack%s\r\nFORGED' } as never,
    res as never,
    jest.fn(),
  );
  const args = log.mock.calls[0];
  expect(args[0]).toBe('[HTTP request failed]');
  expect(args.slice(1).join('')).not.toMatch(/[\r\n]/);
  expect(args[2]).toContain('%s');
  log.mockRestore();
});
