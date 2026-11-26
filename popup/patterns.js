/**
 * DOM Review — match pattern helpers for the popup.
 *
 * Turns what the user types into a Chrome match pattern and tells whether a URL
 * falls under a pattern. No extension APIs here, so it also loads under Node for tests.
 */
(function (root) {
  'use strict';

  // host, optionally "*." in front, optionally ":port" or ":*" at the end
  var HOST_RE = /^(\*|(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:(\d{1,5}|\*))?$/i;
  var INPUT_RE = /^(?:(https?|\*):\/\/)?([^\/\s?#]+)(?:[\/?#].*)?$/i;
  var PATTERN_RE = /^(https?|\*):\/\/([^\/]+)\/.*$/i;

  /**
   * "staging.example.com", "https://app.dev/page", "192.168.1.50:3000" -> match pattern.
   * Without a scheme the pattern covers both http and https. Returns null for junk.
   */
  function normalizeInput(input) {
    var value = (input || '').trim();
    var parts = INPUT_RE.exec(value);
    if (!parts) return null;

    var scheme = (parts[1] || '*').toLowerCase();
    var host = parts[2].toLowerCase();
    if (!HOST_RE.test(host)) return null;

    return scheme + '://' + host + '/*';
  }

  function parsePattern(pattern) {
    var parts = PATTERN_RE.exec(pattern || '');
    if (!parts) return null;

    var hostAndPort = parts[2].toLowerCase();
    var colon = hostAndPort.lastIndexOf(':');
    var hasPort = colon !== -1;
    return {
      scheme: parts[1].toLowerCase(),
      host: hasPort ? hostAndPort.slice(0, colon) : hostAndPort,
      // Chrome treats a missing port as "any port"
      port: hasPort ? hostAndPort.slice(colon + 1) : '*',
    };
  }

  function hostMatches(hostname, patternHost) {
    if (patternHost === '*') return true;
    if (patternHost.indexOf('*.') === 0) {
      var base = patternHost.slice(2);
      return hostname === base || hostname.slice(-(base.length + 1)) === '.' + base;
    }
    return hostname === patternHost;
  }

  function urlMatchesPattern(url, pattern) {
    var parsed = parsePattern(pattern);
    if (!parsed) return false;

    var target;
    try {
      target = new URL(url);
    } catch (e) {
      return false;
    }

    var scheme = target.protocol.replace(':', '');
    if (scheme !== 'http' && scheme !== 'https') return false;
    if (parsed.scheme !== '*' && parsed.scheme !== scheme) return false;
    if (!hostMatches(target.hostname.toLowerCase(), parsed.host)) return false;
    if (parsed.port === '*') return true;

    var port = target.port || (scheme === 'https' ? '443' : '80');
    return port === parsed.port;
  }

  function urlMatchesAnyPattern(url, patterns) {
    return patterns.some(function (pattern) { return urlMatchesPattern(url, pattern); });
  }

  var api = {
    normalizeInput: normalizeInput,
    urlMatchesPattern: urlMatchesPattern,
    urlMatchesAnyPattern: urlMatchesAnyPattern,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DRPatterns = api;
  }
})(typeof self !== 'undefined' ? self : this);
