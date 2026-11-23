// -----------------------------------------------------------------------------
// AWS Signature Version 4, the two flavours the HomeWhiz cloud needs:
//   - signed GET requests to its REST API (API Gateway, `execute-api`);
//   - a pre-signed WebSocket URL for its MQTT broker (AWS IoT Core,
//     `iotdevicegateway`).
// The HomeWhiz login hands out temporary AWS credentials (access key, secret
// key, session token): no AWS SDK needed, node:crypto does the signing.
// -----------------------------------------------------------------------------

import { createHash, createHmac } from 'node:crypto';

export const REGION = 'eu-west-1';
const ALGORITHM = 'AWS4-HMAC-SHA256';

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const hmac = (key, text) => createHmac('sha256', key).update(text, 'utf8').digest();

/** `20261123T201500Z` and `20261123`. */
export function amzDates(date = new Date()) {
  const amzDate = date
    .toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}/, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(secretKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** RFC 3986 encoding, as SigV4 wants it. */
export function awsEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Headers of a signed GET request (the query string must already be in
 * canonical form: sorted, encoded).
 */
export function signGetRequest({
  host,
  path,
  query = '',
  credentials,
  service = 'execute-api',
  date,
}) {
  const { amzDate, dateStamp } = amzDates(date);
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${credentials.sessionToken}\n`;
  const signedHeaders = 'host;x-amz-date;x-amz-security-token';
  const canonicalRequest = [
    'GET',
    path,
    query,
    canonicalHeaders,
    signedHeaders,
    sha256Hex(''),
  ].join('\n');
  const scope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(
    signingKey(credentials.secretKey, dateStamp, REGION, service),
    stringToSign,
  ).toString('hex');
  return {
    'x-amz-date': amzDate,
    'x-amz-security-token': credentials.sessionToken,
    Authorization: `${ALGORITHM} Credential=${credentials.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * Pre-signed `wss://` URL of an AWS IoT Core endpoint. The session token is
 * appended AFTER the signature: AWS IoT does not sign it (unlike S3).
 */
export function presignIotWebsocketUrl({ host, credentials, date }) {
  const service = 'iotdevicegateway';
  const { amzDate, dateStamp } = amzDates(date);
  const scope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const query = [
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${credentials.accessKey}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-SignedHeaders', 'host'],
  ]
    .map(([key, value]) => `${key}=${awsEncode(value)}`)
    .join('&');
  const canonicalRequest = ['GET', '/mqtt', query, `host:${host}\n`, 'host', sha256Hex('')].join(
    '\n',
  );
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(
    signingKey(credentials.secretKey, dateStamp, REGION, service),
    stringToSign,
  ).toString('hex');
  const token = credentials.sessionToken
    ? `&X-Amz-Security-Token=${awsEncode(credentials.sessionToken)}`
    : '';
  return `wss://${host}/mqtt?${query}&X-Amz-Signature=${signature}${token}`;
}
