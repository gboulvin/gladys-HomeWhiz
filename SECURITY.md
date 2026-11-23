# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainer for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove e-mails, passwords, tokens, appliance ids
  and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## How the integration handles your HomeWhiz account

- The HomeWhiz e-mail and password are stored by Gladys in the integration
  configuration; the password is a `secret` field, never sent back to the
  browser.
- They are only sent to the HomeWhiz login endpoint (`api.arcelikiot.com`,
  HTTPS). The temporary AWS credentials it returns live in memory only and
  are renewed before they expire.
- Nothing secret is written to disk: `/data` only caches the appliance
  configurations (program lists, labels).
- The password, the tokens and the signed URLs are never logged.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the HomeWhiz cloud and app (report to Arçelik), and the appliances.
