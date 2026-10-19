jest.mock('../../config/database');
jest.mock('nodemailer');

import nodemailer from 'nodemailer';

import { AlertService } from '../AlertService';

it('escapes all dynamic HTML email fields and requires SMTP TLS certificate validation', async () => {
  const sendMail = jest.fn().mockResolvedValue({});
  jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
  const service = new AlertService() as unknown as {
    sendEmail(cfg: unknown, event: string, message: string, ctx: unknown): Promise<void>;
  };
  await service.sendEmail(
    { smtp_host: 'mail.test', recipients: ['ops@test.invalid'] },
    'device_offline',
    '<script>alert(1)</script>',
    { deviceName: '<img src=x onerror=alert(1)>', details: '</pre><script>bad</script>' },
  );
  const html = sendMail.mock.calls[0][0].html;
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;/pre&gt;');
  expect(nodemailer.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({ tls: { rejectUnauthorized: true } }),
  );
});
