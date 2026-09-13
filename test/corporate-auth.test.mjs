import assert from 'node:assert/strict';
import test from 'node:test';
import { isCorporateEmail, authenticatedCorporateUser } from '../lib/corporate-auth.mjs';

test('isCorporateEmail accepts the corporate domain and the authorized backup address', () => {
  assert.equal(isCorporateEmail('vendedor@grupopoliplast.com.ar'), true);
  assert.equal(isCorporateEmail('VENDEDOR@GRUPOPOLIPLAST.COM.AR'), true);
  assert.equal(isCorporateEmail('felipecnokaert@gmail.com'), true);
  assert.equal(isCorporateEmail('otro@gmail.com'), false);
  assert.equal(isCorporateEmail('notgrupopoliplast.com.ar'), false);
  assert.equal(isCorporateEmail(''), false);
});

test('authenticatedCorporateUser rejects requests without a bearer token or Supabase config', async () => {
  const request = { headers: {} };
  const user = await authenticatedCorporateUser(request, { SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'key' }, async () => {
    throw new Error('http should not be called without a bearer token');
  });
  assert.equal(user, null);
});

test('authenticatedCorporateUser accepts a corporate-domain user and rejects everyone else', async () => {
  const environment = { SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'key' };

  const corporateHttp = async () => ({ ok: true, json: async () => ({ email: 'vendedor@grupopoliplast.com.ar' }) });
  const corporateUser = await authenticatedCorporateUser({ headers: { authorization: 'Bearer good-token' } }, environment, corporateHttp);
  assert.equal(corporateUser?.email, 'vendedor@grupopoliplast.com.ar');

  const outsiderHttp = async () => ({ ok: true, json: async () => ({ email: 'outsider@example.com' }) });
  const outsiderUser = await authenticatedCorporateUser({ headers: { authorization: 'Bearer good-token' } }, environment, outsiderHttp);
  assert.equal(outsiderUser, null);

  const failedAuthHttp = async () => ({ ok: false });
  const rejectedUser = await authenticatedCorporateUser({ headers: { authorization: 'Bearer bad-token' } }, environment, failedAuthHttp);
  assert.equal(rejectedUser, null);
});
