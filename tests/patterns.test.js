// Run with: node --test "tests/*.test.js"
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInput, urlMatchesPattern, urlMatchesAnyPattern } = require('../popup/patterns.js');

test('normalizeInput keeps the scheme the user typed', () => {
  assert.equal(normalizeInput('https://staging.example.com'), 'https://staging.example.com/*');
  assert.equal(normalizeInput('http://myapp.local:5173/'), 'http://myapp.local:5173/*');
  assert.equal(normalizeInput('https://dev.example.com/*'), 'https://dev.example.com/*');
  assert.equal(normalizeInput('*://dev.example.com/*'), '*://dev.example.com/*');
});

test('normalizeInput covers http and https when no scheme is given', () => {
  assert.equal(normalizeInput('staging.example.com'), '*://staging.example.com/*');
  assert.equal(normalizeInput('192.168.1.50:3000'), '*://192.168.1.50:3000/*');
  assert.equal(normalizeInput('  Example.COM/  '), '*://example.com/*');
});

test('normalizeInput drops path, query and hash', () => {
  assert.equal(normalizeInput('https://app.example.com/admin/users?page=2#top'), 'https://app.example.com/*');
});

test('normalizeInput accepts subdomain wildcards and rejects junk', () => {
  assert.equal(normalizeInput('*.example.com'), '*://*.example.com/*');
  assert.equal(normalizeInput(''), null);
  assert.equal(normalizeInput('   '), null);
  assert.equal(normalizeInput('ftp://example.com'), null);
  assert.equal(normalizeInput('exa mple.com'), null);
  assert.equal(normalizeInput('foo.*.com'), null);
  assert.equal(normalizeInput('https://'), null);
});

test('a pattern without a port matches any port', () => {
  assert.equal(urlMatchesPattern('http://localhost:3000/app', 'http://localhost/*'), true);
  assert.equal(urlMatchesPattern('http://localhost/', 'http://localhost/*'), true);
  assert.equal(urlMatchesPattern('http://127.0.0.1:5173/x?y=1', 'http://127.0.0.1/*'), true);
});

test('a pattern with a port matches only that port', () => {
  assert.equal(urlMatchesPattern('http://192.168.1.50:3000/', '*://192.168.1.50:3000/*'), true);
  assert.equal(urlMatchesPattern('http://192.168.1.50:8080/', '*://192.168.1.50:3000/*'), false);
  assert.equal(urlMatchesPattern('https://example.com/', 'https://example.com:443/*'), true);
});

test('the scheme is checked, and * means http or https', () => {
  assert.equal(urlMatchesPattern('https://staging.example.com/a', 'https://staging.example.com/*'), true);
  assert.equal(urlMatchesPattern('http://staging.example.com/a', 'https://staging.example.com/*'), false);
  assert.equal(urlMatchesPattern('https://localhost:3000/', 'http://localhost/*'), false);
  assert.equal(urlMatchesPattern('https://staging.example.com/', '*://staging.example.com/*'), true);
  assert.equal(urlMatchesPattern('http://staging.example.com/', '*://staging.example.com/*'), true);
  assert.equal(urlMatchesPattern('chrome://extensions/', '*://extensions/*'), false);
});

test('hosts match exactly unless the pattern starts with *.', () => {
  assert.equal(urlMatchesPattern('https://evil-example.com/', 'https://example.com/*'), false);
  assert.equal(urlMatchesPattern('https://example.com.evil.io/', 'https://example.com/*'), false);
  assert.equal(urlMatchesPattern('https://app.example.com/', 'https://*.example.com/*'), true);
  assert.equal(urlMatchesPattern('https://example.com/', 'https://*.example.com/*'), true);
  assert.equal(urlMatchesPattern('https://notexample.com/', 'https://*.example.com/*'), false);
});

test('urlMatchesAnyPattern and broken input', () => {
  const patterns = ['http://localhost/*', 'https://staging.example.com/*'];
  assert.equal(urlMatchesAnyPattern('https://staging.example.com/x', patterns), true);
  assert.equal(urlMatchesAnyPattern('https://other.example.com/x', patterns), false);
  assert.equal(urlMatchesPattern('not a url', 'http://localhost/*'), false);
  assert.equal(urlMatchesPattern('http://localhost/', 'garbage'), false);
});
