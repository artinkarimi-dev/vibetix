# Shared abuse protection

`AbuseProtection` uses one atomic Redis Lua increment/expiry per budget. All API instances must use the same Redis service, independent `ABUSE_KEY_SECRET`, policy and time window. Redis keys contain HMACs, not raw emails/IPs/account identifiers. Redis uses bounded connection/command timeouts; sensitive requests fail with 503 when counters cannot be checked. There is no silent fallback to per-instance memory. Startup fails if configured Redis is unavailable. Memory counters remain available only for development/test; production configuration requires authenticated `rediss://`.

| Configuration | Default / scope |
| --- | --- |
| GLOBAL_RATE_LIMIT | 600/minute per client IP, except dependency readiness |
| AUTH_IP_LIMIT | 10/minute per IP per login/register/password operation |
| AUTH_IDENTITY_LIMIT / AUTH_WINDOW_MS | 20/15 minutes per normalized email per operation, across IPs/instances |
| HOLD_RATE_LIMIT | 30/minute per authenticated account across events |
| CHECKOUT_RATE_LIMIT | 10/minute per account, including invalid attempts/replays |
| PROMO_RATE_LIMIT | 30/minute per account for all quotes, including promo failures |

Limits are positive integers supplied identically to all instances. Over-limit responses use `RATE_LIMITED`, generic text and `Retry-After`; they do not say whether an account exists. Registration returns the same 201/`{ok:true}` for new/duplicate addresses; login failures remain generic and use the bcrypt comparison path. Immediate password-based signup/login can still permit identity inference; verified-email enrollment remains release work.

Password reset/change endpoints do not exist. The password-operation prefix is reserved by the limiter, but a future endpoint must deliberately select the correct identity and require its own token validation, single-use semantics and tests. No password recovery feature is claimed.

Authenticated hold/quote/checkout budgets execute before business mutations, after session identification. Denials generate fixed structured security events. These are attempt budgets, not verified-person quotas: multiple accounts, slow seat hoarding, distributed traffic below thresholds and coarse IPv6 identity remain risks. A fixed-window boundary can permit a burst across adjacent windows; capacity-test and tune before sales. An attacker can temporarily consume another email's identity budget; do not treat this as an account lock or permanent disablement.

## Redis deployment

Use an isolated, authenticated TLS primary with capacity monitoring, `noeviction`, high availability and a reviewed persistence/restart policy. Counter loss on Redis restart resets budgets; failover continuity is an operational requirement. Do not publish Redis publicly. Use a dedicated ACL user restricted to `~vibetix:abuse:v1:*`, `PING`, `INFO` (client readiness), `EVAL`, `INCR`, `PEXPIRE`, `PTTL` and required client metadata subcommands. Do not grant FLUSHALL/CONFIG/administration. Validate that provider ACL/script restrictions work with the installed client; no production Redis ACL/TLS/failover has been exercised.

The local Compose Redis has no password/TLS and is reachable only on its container network; it is a development service. Production secrets use `REDIS_URL_FILE`, certificate validation defaults and private CA provisioning when needed. Observe Redis saturation and 503s so fail-closed protection does not become an unexplained outage.

## Proxy identity

Default proxy trust is disabled. `TRUSTED_PROXY_CIDRS` accepts explicit addresses/CIDRs only, not true/hop counts or `/0`. Restrict network ingress to the trusted proxy, overwrite incoming forwarded headers there, and test the exact topology. The production template pins a dedicated nginx peer address; adapt its network to avoid conflicts. Never trust every container/subnet merely to make limits work.

Integration tests use two independent API instances against real Redis, concurrent requests from different IPs, spoofed forwarded headers and disconnected-client failure. They test limits and their privacy behavior; they are not a distributed load benchmark. Redis implementation guidance: [ioredis](https://github.com/redis/ioredis).
