/* oxlint-disable charming/no-production-host -- generated from the production OpenAPI fallback; regenerate with bun run cli:gen */
// Generated from openapi.json by @hey-api/openapi-ts. Run `bun run openapi:gen`.
export const generatedOperations = [
  {
    "id": "accept-app-share",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/shares/accept",
    "summary": "Accept a share invitation",
    "description": "User-gated (`chrm_user_*` or session). Accepts the CALLER’s pending invitation for this app; idempotent (`alreadyAccepted: true` on a repeat).",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Accepted (or already accepted).",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "alreadyAccepted": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request accept-app-share --param appId=VALUE"
  },
  {
    "id": "accept-team-invitation",
    "method": "POST",
    "path": "/api/v1/team-invitations/{invitationId}/accept",
    "summary": "Accept a team invitation",
    "description": "Session cookie required. Personal access tokens are not accepted. The Better Auth org plugin validates the caller is the invitation’s recipient and creates the membership; refusals are relayed verbatim.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "invitationId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Invitation accepted; the caller is now a member.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request accept-team-invitation --param invitationId=VALUE"
  },
  {
    "id": "add-team-member",
    "method": "POST",
    "path": "/api/v1/teams/{teamId}/members",
    "summary": "Add a member to a team",
    "description": "User-gated (`chrm_user_*` or session); caller must be a team owner/admin, and only an owner may grant the `owner` role. The grantee (handle or email) must already hold a Charming account.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "grantee"
        ],
        "properties": {
          "grantee": {
            "type": "string",
            "description": "Handle or email of the new member."
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "grantee": "string"
      }
    },
    "response": {
      "description": "Member added.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "userId",
          "role"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "userId": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request add-team-member --param teamId=VALUE --body @body.json"
  },
  {
    "id": "approve-pairing",
    "method": "POST",
    "path": "/api/pair/approve",
    "summary": "Approve a pairing (browser-side, signed-in user)",
    "description": "Idempotent. The plaintext token is delivered to the agent via `/api/pair/poll`, never returned here. The legacy `/pair/approve` path 308s here.",
    "parameters": [],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "user_code"
        ],
        "properties": {
          "user_code": {
            "type": "string",
            "pattern": "^CHRM-[A-Z2-9]{6}$"
          }
        }
      },
      "example": {
        "user_code": "string"
      }
    },
    "response": {
      "description": "Approved",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request approve-pairing --body @body.json"
  },
  {
    "id": "call-app-operation",
    "method": "POST",
    "path": "/app/{id}/api/{operation}",
    "summary": "Call a declared app route or its unmatched-request fallback",
    "description": "External callers must use Bearer auth. The platform strips `/app/<id>` so the app sees `/api/<operation>`. A declared route handler returns exactly its `outputSchema` value without adding a transport envelope unless those fields belong to the schema; Charming validates it and wraps HTTP success as `{ ok: true, value }`. `window.charming.api` uses `renderToken` and unwraps that envelope, so in-page callers receive the value directly. If no declared route matches, the optional `default.fetch` handles the request and its `Response` passes through unchanged; without that fallback, Charming returns a 404. Direct callers should use `appToken` or `userToken`.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "operation",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "additionalProperties": true,
        "description": "Input defined by the selected app operation. Fetch the app-specific `/app/{id}/openapi.json` document for its typed schema before generating a function input."
      }
    },
    "response": {
      "description": "A declared route returns `{ ok: true, value }`, where `value` matches its `outputSchema`. A custom unmatched-request fallback response passes through unchanged.",
      "schema": {
        "type": "object",
        "description": "Declared route success uses `{ ok: true, value }`; the route handler returns exactly the `outputSchema` value and does not add a transport envelope unless those fields belong to the schema. The open object schema also permits the author-defined body from an unmatched request handled by `default.fetch`.",
        "additionalProperties": true
      }
    },
    "security": [
      "appToken",
      "renderToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 30000,
    "usage": "charming api request call-app-operation --param id=VALUE --param operation=VALUE --body @body.json"
  },
  {
    "id": "cancel-app-build",
    "method": "POST",
    "path": "/api/v1/app-builds/{buildId}/cancel",
    "summary": "Cancel a pending app build",
    "description": "Cancel pending work using current user source access. Repeated cancellation is safe. A canceled operation cannot publish even if remote work finishes later; the active app stays unchanged. Cancellation remains available after authoring cohort removal. Browser form submissions render the terminal result as HTML.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "buildId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Current build operation.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "buildId",
          "intent",
          "state",
          "sourceEtag",
          "statusUrl",
          "attempts",
          "acceptedAt",
          "updatedAt",
          "finishedAt",
          "elapsedMs",
          "lockState",
          "inputDigest",
          "queueDeadline",
          "deadline",
          "inspectionExpiresAt",
          "idempotencyExpiresAt"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "buildId": {
            "type": "string"
          },
          "intent": {
            "type": "string",
            "enum": [
              "create",
              "update",
              "migrate",
              "restore",
              "copy"
            ]
          },
          "state": {
            "type": "string",
            "enum": [
              "queued",
              "resolving",
              "building",
              "validating",
              "published",
              "failed",
              "superseded",
              "canceled",
              "expired"
            ]
          },
          "sourceEtag": {
            "type": "string"
          },
          "statusUrl": {
            "type": "string",
            "format": "uri"
          },
          "retryAfterSeconds": {
            "type": "integer"
          },
          "appId": {
            "type": "string",
            "format": "uuid"
          },
          "revision": {
            "type": "integer",
            "minimum": 1,
            "description": "Published app source revision. Present only after successful publication."
          },
          "desiredRevision": {
            "type": "integer"
          },
          "activeRevision": {
            "type": "integer"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "attempts": {
            "type": "integer"
          },
          "acceptedAt": {
            "type": "string",
            "format": "date-time"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time"
          },
          "finishedAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "elapsedMs": {
            "type": "integer"
          },
          "lockState": {
            "type": "string",
            "enum": [
              "locked",
              "unresolved"
            ]
          },
          "inputDigest": {
            "type": "string"
          },
          "lockDigest": {
            "type": "string"
          },
          "resolvedDependencies": {
            "type": "object",
            "required": [
              "server",
              "client"
            ],
            "properties": {
              "server": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              },
              "client": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              }
            }
          },
          "queueDeadline": {
            "type": "string",
            "format": "date-time"
          },
          "deadline": {
            "type": "string",
            "format": "date-time"
          },
          "inspectionExpiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "idempotencyExpiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "source": {
            "type": "object",
            "required": [
              "module",
              "ui",
              "styles",
              "description"
            ],
            "properties": {
              "module": {
                "type": "string"
              },
              "ui": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "styles": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "description": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          },
          "error": {
            "type": "object",
            "required": [
              "kind",
              "message",
              "retryable"
            ],
            "properties": {
              "kind": {
                "type": "string"
              },
              "message": {
                "type": "string"
              },
              "retryable": {
                "type": "boolean"
              },
              "details": {
                "anyOf": [
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "execution",
                      "operationId"
                    ],
                    "properties": {
                      "execution": {
                        "type": "string",
                        "enum": [
                          "not_started",
                          "may_have_run"
                        ]
                      },
                      "operationId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "reservationId": {
                        "type": "string",
                        "minLength": 1
                      }
                    }
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "execution"
                    ],
                    "properties": {
                      "execution": {
                        "type": "string",
                        "enum": [
                          "may_have_run"
                        ]
                      }
                    }
                  }
                ]
              },
              "target": {
                "type": "string"
              },
              "specifier": {
                "type": "string"
              },
              "line": {
                "type": "integer"
              },
              "column": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request cancel-app-build --param buildId=VALUE"
  },
  {
    "id": "cancel-team-invitation",
    "method": "DELETE",
    "path": "/api/v1/team-invitations/{invitationId}",
    "summary": "Cancel an outgoing team invitation",
    "description": "Session cookie required. Personal access tokens are not accepted; owner/admin of the invitation’s team only (plugin gate, relayed). Removes the invitation from the pending set.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "invitationId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Invitation cancelled."
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request cancel-team-invitation --param invitationId=VALUE"
  },
  {
    "id": "claim-app",
    "method": "POST",
    "path": "/app/{id}/claim",
    "summary": "Claim an unclaimed app for the authenticated user",
    "description": "Body must include the app’s `chrm_app_*` token. On success, ownership transfers and a bound pairing (if any) is auto-approved.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "token"
        ],
        "properties": {
          "token": {
            "type": "string"
          }
        }
      },
      "example": {
        "token": "string"
      }
    },
    "response": {
      "description": "Claimed",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "id",
          "manifestId",
          "claimedAt"
        ],
        "description": "Acknowledgement returned by POST /app/{id}/claim once ownership transfers.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "manifestId": {
            "type": "string"
          },
          "claimedAt": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request claim-app --param id=VALUE --body @body.json"
  },
  {
    "id": "clear-app-icon",
    "method": "DELETE",
    "path": "/app/{id}/icon",
    "summary": "Clear the icon and fall back to the default icon",
    "description": "Owner-only. Sets `icon` to `null` so the SVG / PNG renderers fall back to the default icon. Idempotent.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Icon cleared.",
      "schema": {
        "type": "object",
        "required": [
          "icon"
        ],
        "properties": {
          "icon": {
            "type": "null"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request clear-app-icon --param id=VALUE"
  },
  {
    "id": "create-app",
    "method": "POST",
    "path": "/app",
    "summary": "Create an app or accept an ESM app build",
    "description": "Existing-contract callers receive a published app synchronously; anonymous creation returns a chrm_app_* token and may request pair: true. The explicit https://charm.ing/schema/app-manifest/2026-09-05.json contract requires an enabled authenticated user and Idempotency-Key, validates imports without evaluation, and returns 202 before dependency resolution or compilation. A same-owner manifest.id target is frozen at acceptance; an absent target cannot later become an overwrite. Use PUT for a known app. Every existing ESM destination requires its desired revision in If-Match; migration also requires migrate_contract: true. pair and label are not ESM fields.",
    "parameters": [
      {
        "description": "Required for ESM saves. Reuse the same key, body, target and If-Match after response loss; a changed request with that key returns idempotency_conflict. Use a fresh key for each intentional save.",
        "in": "header",
        "name": "Idempotency-Key",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128,
          "pattern": "^[!-~]+$"
        }
      },
      {
        "description": "Desired-source revision in double quotes for an ESM upsert or migration. Read GET /app/{id}/source first.",
        "in": "header",
        "name": "If-Match",
        "required": false,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "module"
        ],
        "properties": {
          "module": {
            "type": "string",
            "description": "Server ES module source. Must export a literal canonical `manifest` and a `routes` array. A route handler returns exactly the value declared by `outputSchema`; for `outputSchema: { type: \"array\", items: ... }`, return the array directly. Charming adds the HTTP transport envelope, so do not add `{ ok, value }` or `{ value }` unless those fields belong to `outputSchema` itself. `default.fetch` is an optional unmatched-request fallback; when absent, Charming supplies a generic 404 handler. Existing contracts publish synchronously; the explicit https://charm.ing/schema/app-manifest/2026-09-05.json contract requires an enabled authenticated user and accepts a background build."
          },
          "ui": {
            "type": [
              "string",
              "null"
            ],
            "description": "Optional browser source populating #app. A classic script for the existing contract; an ES module for the explicit ESM contract. ESM bare imports must match manifest.dependencies.client."
          },
          "styles": {
            "type": [
              "string",
              "null"
            ],
            "description": "Optional CSS injected alongside ui."
          },
          "description": {
            "type": [
              "string",
              "null"
            ],
            "description": "Optional app description, shown to the owner and to callers who read it back. For ESM POST upserts, omission preserves the desired description."
          },
          "migrate_contract": {
            "type": "boolean",
            "description": "ESM POST only: true explicitly migrates an existing same-owner manifest.id target. Supply its desired revision in If-Match. The existing app remains active until the build publishes."
          },
          "pair": {
            "type": "boolean",
            "description": "Existing-contract anonymous POST only; rejected on ESM saves. Silently ignored on existing-contract authenticated upserts. When true, server mints a bound device_code alongside the app token; user-claim auto-approves the pairing and the agent ends up with both an app token and a `chrm_user_*`."
          },
          "label": {
            "type": "string",
            "maxLength": 80,
            "description": "Existing-contract anonymous POST only; rejected on ESM saves. Silently ignored on existing-contract authenticated upserts. Human-readable label for the agent, surfaced to the user on the `/pair` approval page when `pair: true`."
          }
        },
        "additionalProperties": false
      },
      "example": {
        "module": "string"
      }
    },
    "response": {
      "description": "App created or upserted.",
      "schema": {
        "type": "object",
        "required": [
          "id",
          "manifestId",
          "displayName",
          "url",
          "capabilities",
          "claimed",
          "revision"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "manifestId": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "capabilities": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "imports": {
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "oneOf": [
                    {
                      "enum": [
                        "charming:storage/kv@1.0",
                        "charming:storage/blob@1.0",
                        "charming:logging/emit@1.0",
                        "charming:network/fetch@1.0",
                        "charming:secrets/fetch@1.0",
                        "charming:browser/microphone@1.0",
                        "charming:browser/camera@1.0",
                        "charming:browser/geolocation@1.0",
                        "charming:browser/clipboard-read@1.0",
                        "charming:browser/display-capture@1.0",
                        "charming:browser/midi@1.0",
                        "charming:browser/device-motion@1.0",
                        "charming:browser/ambient-light@1.0",
                        "charming:browser/storage@1.0"
                      ]
                    },
                    {
                      "type": "string",
                      "pattern": "^charming:app/[a-z0-9][a-z0-9-]{0,63}@[0-9]+\\.[0-9]+(?:\\.[0-9]+)?$"
                    }
                  ]
                }
              }
            }
          },
          "icon": {
            "anyOf": [
              {
                "type": "object",
                "description": "Optional home-screen / favicon icon. The server composes a colored rounded-square PNG/SVG from `emoji + bg` — NOT a list of image URLs like a W3C web manifest. Omit it to get the default icon. If `emoji` or `bg` is invalid the whole icon is silently dropped (stored as unset, so the default renders) and the create/update response carries a `warnings[]` entry. This warn-and-drop contract is the `manifest.icon` publish path only (`PUT /app/{id}` and its create counterpart) — `PUT /app/{id}/icon` uses the stricter `IconStrict` schema instead.",
                "required": [
                  "emoji",
                  "bg"
                ],
                "properties": {
                  "emoji": {
                    "type": "string",
                    "description": "A single emoji, rendered centered (e.g. `⚽`). Extra glyphs are dropped."
                  },
                  "bg": {
                    "type": "string",
                    "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
                    "description": "Background color as a hex string (`#rgb`, `#rrggbb`, or `#rrggbbaa`). Named colors (`\"green\"`), `rgb()`/`hsl()`, and image URLs are rejected."
                  }
                },
                "additionalProperties": false
              },
              {
                "type": "null"
              }
            ]
          },
          "claimed": {
            "type": "boolean"
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "example": 4,
            "examples": [
              0,
              4
            ],
            "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
          },
          "token": {
            "type": "string",
            "description": "Anonymous-create only. `chrm_app_*` plaintext, returned exactly once — irrecoverable."
          },
          "expiresAt": {
            "type": "string",
            "format": "date-time",
            "description": "Anonymous-create only. 7-day TTL unless claimed."
          },
          "mcpHint": {
            "type": "object",
            "properties": {
              "setupUrl": {
                "type": "string",
                "format": "uri"
              },
              "snippets": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              }
            }
          },
          "pairing": {
            "type": "object",
            "description": "Present only when the request body included `pair: true`. Agent should poll `POST /api/pair/poll` with `device_code` until status flips to `approved`.",
            "properties": {
              "device_code": {
                "type": "string"
              },
              "user_code": {
                "type": "string",
                "pattern": "^CHRM-[A-Z2-9]{6}$",
                "description": "Show verbatim to the user; they type it on `verification_url`."
              },
              "verification_url": {
                "type": "string",
                "format": "uri"
              },
              "polling_interval": {
                "type": "integer"
              },
              "expires_in": {
                "type": "integer"
              }
            }
          },
          "warnings": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Non-blocking publish feedback (#1126), present only when static validation found UI/backend contract mismatches — e.g. the UI calls an operation this version does not expose. The write succeeded; fix by adding the backend op or renaming the UI call."
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-app --body @body.json"
  },
  {
    "id": "create-app-secret",
    "method": "POST",
    "path": "/app/{id}/secrets",
    "summary": "Create a new secret value",
    "description": "Owner-only, write-only. Creates a new encrypted secret value under a name. The name must match `^[A-Z][A-Z0-9_]*$` (the same charset a `{{secret:NAME}}` reference uses, so a settable name is always referenceable); values are capped at 8 KiB. The value is never echoed back. Returns 409 `secret_already_exists` if a secret with the same name already exists for this scope; use PUT to replace it. Requires the owner's user token; app/render tokens are rejected.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "name",
          "value"
        ],
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Z][A-Z0-9_]*$",
            "description": "Env-var-shaped secret name (referenceable via `{{secret:NAME}}`)."
          },
          "value": {
            "type": "string",
            "maxLength": 8192,
            "description": "Plaintext secret value (max 8 KiB). Stored encrypted; never returned."
          }
        }
      },
      "example": {
        "name": "string",
        "value": "string"
      }
    },
    "response": {
      "description": "Secret stored.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-app-secret --param id=VALUE --body @body.json"
  },
  {
    "id": "create-app-share",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/shares",
    "summary": "Invite a user to an app",
    "description": "User-gated (`chrm_user_*` or session); owner only (`app:share`). Creates a pending invitation — `status: \"pending\"` for an existing account, `\"invited\"` for an email with no account yet. No access is granted until the grantee accepts.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "grantee"
        ],
        "properties": {
          "grantee": {
            "type": "string",
            "description": "Handle or email of the invitee."
          },
          "role": {
            "type": "string",
            "enum": [
              "collaborator",
              "end-user",
              "viewer"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "grantee": "string"
      }
    },
    "response": {
      "description": "Invitation created.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "status"
        ],
        "description": "`pending` = an existing user must accept; `invited` = an email-keyed invitation that materializes when that address registers.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "invited"
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-app-share --param appId=VALUE --body @body.json"
  },
  {
    "id": "create-routine",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/routines",
    "summary": "Schedule a Routine on an app",
    "description": "Session-gated; requires `app:write`. Schedules a declared op to run on its own, on a timer (`hourly` | `daily` | `weekly`). The op is invoked with empty input, so it must declare no required input fields. Rejects a duplicate (app, op) pair, and enforces a per-app and a per-owner cap from the app owner's plan, which for a team app is the team's plan rather than the caller's. `limits` on `GET /api/v1/routines` reports the caller's own plan, so it matches only their personal apps. The free defaults are 3 per app and 25 per owner.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "op",
          "interval"
        ],
        "properties": {
          "op": {
            "type": "string"
          },
          "interval": {
            "type": "string",
            "enum": [
              "hourly",
              "daily",
              "weekly"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "op": "string",
        "interval": "hourly"
      }
    },
    "response": {
      "description": "Routine created.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "routine"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "routine": {
            "type": "object",
            "description": "A declared op scheduled to run on a timer. The op is invoked with empty input, so it must declare no required input fields.",
            "required": [
              "id",
              "app_id",
              "op",
              "interval",
              "enabled",
              "disabled_reason",
              "next_run_at",
              "last_run_at",
              "last_outcome",
              "last_error",
              "consecutive_failures"
            ],
            "properties": {
              "id": {
                "type": "string",
                "description": "Public id, `routine_<uuid>` form."
              },
              "app_id": {
                "type": "string",
                "format": "uuid"
              },
              "op": {
                "type": "string"
              },
              "interval": {
                "type": "string",
                "enum": [
                  "hourly",
                  "daily",
                  "weekly"
                ]
              },
              "enabled": {
                "type": "boolean"
              },
              "disabled_reason": {
                "type": [
                  "string",
                  "null"
                ],
                "enum": [
                  "owner",
                  "auto",
                  null
                ]
              },
              "next_run_at": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time",
                "description": "`null` while the Routine is disabled — the underlying schedule is preserved and reappears here once re-enabled, with no recomputation."
              },
              "last_run_at": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "last_outcome": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "last_error": {
                "type": [
                  "object",
                  "null"
                ],
                "required": [
                  "kind",
                  "message"
                ],
                "properties": {
                  "kind": {
                    "type": "string"
                  },
                  "message": {
                    "type": "string"
                  }
                }
              },
              "consecutive_failures": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-routine --param appId=VALUE --body @body.json"
  },
  {
    "id": "create-team",
    "method": "POST",
    "path": "/api/v1/teams",
    "summary": "Create a team",
    "description": "User-gated (`chrm_user_*` or session). Creates a team; the caller becomes its owner. The slug shares the handle namespace with user handles. Refused with 403 `plan_required` (`feature: 'teams'`) unless the caller's plan includes teams; teams come with the Business plan and are set up with Charming.",
    "parameters": [],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "name",
          "slug"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "slug": {
            "type": "string",
            "description": "Team handle (kebab-case, shared namespace)."
          }
        },
        "additionalProperties": false
      },
      "example": {
        "name": "string",
        "slug": "string"
      }
    },
    "response": {
      "description": "Team created.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "team"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "team": {
            "type": "object",
            "required": [
              "id",
              "slug"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "slug": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-team --body @body.json"
  },
  {
    "id": "create-team-invitation",
    "method": "POST",
    "path": "/api/v1/teams/{teamId}/invitations",
    "summary": "Invite a user to a team by email",
    "description": "Session cookie required. Personal access tokens are not accepted; the Better Auth org plugin gates the invite (owner/admin caller) and sends the email. Invitation actions live under /api/v1/team-invitations/{invitationId}.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "email"
        ],
        "properties": {
          "email": {
            "type": "string",
            "format": "email"
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "email": "string"
      }
    },
    "response": {
      "description": "Invitation created and emailed.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "invitation"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "invitation": {
            "type": "object",
            "required": [
              "id",
              "email",
              "role",
              "status"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "email": {
                "type": "string"
              },
              "role": {
                "type": "string"
              },
              "status": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-team-invitation --param teamId=VALUE --body @body.json"
  },
  {
    "id": "create-token",
    "method": "POST",
    "path": "/api/token",
    "summary": "Mint a personal access token (`chrm_user_*`)",
    "description": "Plaintext returned exactly once. 7-day TTL unless `expiresInDays` picks another lifetime. The legacy `/token` path 308s here.",
    "parameters": [],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string",
            "maxLength": 80
          },
          "expiresInDays": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 1,
            "maximum": 365,
            "default": 7,
            "description": "Whole days until the token expires. Choose a longer lifetime for a client that can only hold a static bearer token. A caller using a personal access token can create only default-lifetime tokens; a longer one needs a sign-in session."
          }
        }
      },
      "example": {}
    },
    "response": {
      "description": "Token minted",
      "schema": {
        "type": "object",
        "required": [
          "token",
          "tokenPrefix",
          "expiresAt"
        ],
        "description": "Minted personal access token. `token` plaintext is returned exactly once.",
        "properties": {
          "token": {
            "type": "string"
          },
          "tokenPrefix": {
            "type": "string"
          },
          "label": {
            "type": [
              "string",
              "null"
            ]
          },
          "expiresAt": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-token --body @body.json"
  },
  {
    "id": "create-webhook",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/webhooks",
    "summary": "Declare a Webhook on an app",
    "description": "Session-gated; requires `app:write`. Declares one of the app’s ops as a Webhook target an external sender can invoke by POSTing to the returned `url` with the returned `secret` (shown once). Unlike a Routine, the op may declare required input: the sender supplies the body. Rejects a duplicate (app, op) pair and enforces a per-app and a per-owner cap from the app owner's plan, which for a team app is the team's plan rather than the caller's. `limits` on `GET /api/v1/webhooks` reports the caller's own plan, so it matches only their personal apps. The free defaults are 3 per app and 25 per owner.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "op"
        ],
        "properties": {
          "op": {
            "type": "string"
          },
          "name": {
            "type": "string",
            "maxLength": 80
          }
        },
        "additionalProperties": false
      },
      "example": {
        "op": "string"
      }
    },
    "response": {
      "description": "Webhook created. `secret` appears only in this response.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "webhook",
          "secret",
          "target"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "webhook": {
            "type": "object",
            "description": "A declared op an external sender invokes by POSTing to `url` with the Webhook secret. The body is the op’s input.",
            "required": [
              "id",
              "app_id",
              "op",
              "name",
              "url",
              "secret_prefix",
              "enabled",
              "disabled_reason",
              "last_run_at",
              "last_outcome",
              "last_error",
              "consecutive_failures"
            ],
            "properties": {
              "id": {
                "type": "string",
                "description": "Public id, `webhook_<uuid>` form."
              },
              "app_id": {
                "type": "string",
                "format": "uuid"
              },
              "op": {
                "type": "string"
              },
              "name": {
                "type": "string",
                "description": "The owner’s label; defaults to the op’s title, description, or identifier."
              },
              "url": {
                "type": "string",
                "description": "The delivery URL an external sender POSTs to."
              },
              "secret_prefix": {
                "type": "string",
                "description": "First characters of the secret, for matching a stored copy by eye."
              },
              "enabled": {
                "type": "boolean"
              },
              "disabled_reason": {
                "type": [
                  "string",
                  "null"
                ],
                "enum": [
                  "owner",
                  null
                ]
              },
              "last_run_at": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "last_outcome": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "last_error": {
                "type": [
                  "object",
                  "null"
                ],
                "required": [
                  "kind",
                  "message"
                ],
                "properties": {
                  "kind": {
                    "type": "string"
                  },
                  "message": {
                    "type": "string"
                  }
                }
              },
              "consecutive_failures": {
                "type": "integer"
              }
            }
          },
          "secret": {
            "type": "string",
            "description": "The `chrm_hook_*` secret. Shown once; only its hash is stored."
          },
          "target": {
            "type": "object",
            "description": "The target op’s contract: the JSON body a sender must POST and the value it gets back, read from the app’s active code.",
            "required": [
              "op",
              "input_schema",
              "output_schema"
            ],
            "properties": {
              "op": {
                "type": "string"
              },
              "input_schema": {
                "type": [
                  "object",
                  "null"
                ]
              },
              "output_schema": {
                "type": [
                  "object",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request create-webhook --param appId=VALUE --body @body.json"
  },
  {
    "id": "decline-app-share",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/shares/decline",
    "summary": "Decline or leave a share",
    "description": "User-gated (`chrm_user_*` or session). Declines the CALLER’s pending invite or leaves an accepted share; idempotent (`removed: false` when there was nothing).",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Declined / left (or nothing to remove).",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "removed"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "removed": {
            "type": "boolean"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request decline-app-share --param appId=VALUE"
  },
  {
    "id": "decline-team-invitation",
    "method": "POST",
    "path": "/api/v1/team-invitations/{invitationId}/decline",
    "summary": "Decline a team invitation",
    "description": "Session cookie required. Personal access tokens are not accepted. The Better Auth org plugin validates the caller is the invitation’s recipient and marks it rejected; refusals are relayed verbatim.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "invitationId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Invitation declined.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request decline-team-invitation --param invitationId=VALUE"
  },
  {
    "id": "delete-app",
    "method": "DELETE",
    "path": "/app/{id}",
    "summary": "Delete an app",
    "description": "Permanently removes the app row. Bearer must authorize this app (`chrm_app_*` for the same id, or the owning user). Pass `?purge=storage` to also wipe the app’s key-value rows; without it, the storage table is left as-is for forensic readability.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Pass `?purge=storage` to also wipe the app’s key-value rows.",
        "in": "query",
        "name": "purge",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "storage"
          ]
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Deleted",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request delete-app --param id=VALUE"
  },
  {
    "id": "delete-app-asset",
    "method": "DELETE",
    "path": "/app/{id}/assets/{key}",
    "summary": "Delete an asset",
    "description": "Deletes one asset by key. Returns `{ok:true}` when deleted, `{ok:false}` (404) when the asset does not exist. Auth posture: `requireAppAccess` (app token, user token, render token, or claim cookie).",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "key",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Asset deleted. A missing asset returns 404 (not 200).",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "appToken",
      "renderToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request delete-app-asset --param id=VALUE --param key=VALUE"
  },
  {
    "id": "delete-app-secret",
    "method": "DELETE",
    "path": "/app/{id}/secrets",
    "summary": "Delete a secret by name",
    "description": "Owner-only. Removes the named secret. The name is passed as the `name` query parameter. Requires the owner's user token; app/render tokens are rejected.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "The secret name to delete.",
        "in": "query",
        "name": "name",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Secret deleted.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request delete-app-secret --param id=VALUE --param name=VALUE"
  },
  {
    "id": "delete-routine",
    "method": "DELETE",
    "path": "/api/v1/routines/{routineId}",
    "summary": "Delete a Routine",
    "description": "Session-gated; requires `app:write` on the routine's app. Stops and removes the Routine.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "routineId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Routine deleted."
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request delete-routine --param routineId=VALUE"
  },
  {
    "id": "delete-webhook",
    "method": "DELETE",
    "path": "/api/v1/webhooks/{webhookId}",
    "summary": "Delete a Webhook",
    "description": "Session-gated; requires `app:write` on the webhook's app. Removes the Webhook; its secret stops working at once.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "webhookId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Webhook deleted."
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request delete-webhook --param webhookId=VALUE"
  },
  {
    "id": "deliver-webhook",
    "method": "POST",
    "path": "/api/v1/hooks/{webhookId}",
    "summary": "Deliver an event to a Webhook",
    "description": "The URL an external sender calls. Present the Webhook's secret as `Authorization: Bearer chrm_hook_…` or `?key=chrm_hook_…`. The JSON body is the target op's input, validated against its declared input schema; the response is the op's own result envelope, validated against its output schema. Tagged `x-charming-trigger: webhook` for the handler.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "webhookId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "The Webhook secret, for senders that cannot set an Authorization header.",
        "in": "query",
        "name": "key",
        "required": false,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "additionalProperties": true,
        "description": "The target op's input. Its shape is the op's declared input schema, returned as `target.input_schema` when the Webhook was created, so it cannot be closed here."
      }
    },
    "response": {
      "description": "The op's result envelope, `{ ok: true, value }`.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "value"
        ],
        "description": "The op's own result envelope, validated against its declared output schema.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "value": {
            "description": "The op's return value."
          }
        }
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request deliver-webhook --param webhookId=VALUE --body @body.json"
  },
  {
    "id": "describe-app",
    "method": "GET",
    "path": "/app/{id}/describe",
    "summary": "Owner-only metadata + storage key inventory",
    "description": "Returns the resolved app envelope (manifest, capabilities, revision), whether `ui`/`styles` are present, the persisted storage keys, and a machine-readable API summary so an agent can plan calls without reading the module source. Use a fresh `GET /app/{id}/source` response or ETag for write preconditions; a cached descriptor revision is informational.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Metadata",
      "schema": {
        "type": "object",
        "required": [
          "id",
          "manifestId",
          "displayName",
          "revision",
          "capabilities",
          "ui",
          "styles",
          "claimed",
          "expiresAt",
          "api",
          "storageKeys"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "manifestId": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "example": 4,
            "examples": [
              0,
              4
            ],
            "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
          },
          "capabilities": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "imports": {
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "oneOf": [
                    {
                      "enum": [
                        "charming:storage/kv@1.0",
                        "charming:storage/blob@1.0",
                        "charming:logging/emit@1.0",
                        "charming:network/fetch@1.0",
                        "charming:secrets/fetch@1.0",
                        "charming:browser/microphone@1.0",
                        "charming:browser/camera@1.0",
                        "charming:browser/geolocation@1.0",
                        "charming:browser/clipboard-read@1.0",
                        "charming:browser/display-capture@1.0",
                        "charming:browser/midi@1.0",
                        "charming:browser/device-motion@1.0",
                        "charming:browser/ambient-light@1.0",
                        "charming:browser/storage@1.0"
                      ]
                    },
                    {
                      "type": "string",
                      "pattern": "^charming:app/[a-z0-9][a-z0-9-]{0,63}@[0-9]+\\.[0-9]+(?:\\.[0-9]+)?$"
                    }
                  ]
                }
              }
            }
          },
          "ui": {
            "type": "boolean"
          },
          "styles": {
            "type": "boolean"
          },
          "claimed": {
            "type": "boolean"
          },
          "expiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "api": {
            "type": "object",
            "description": "Machine-readable app API summary for agents. Raw module source is intentionally omitted; operations are derived from manifest exports and literal /api/<operation> routes.",
            "required": [
              "baseUrl",
              "operations"
            ],
            "properties": {
              "baseUrl": {
                "type": "string",
                "format": "uri"
              },
              "operations": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "op",
                    "method",
                    "path",
                    "url",
                    "tool",
                    "discoveredFrom"
                  ],
                  "properties": {
                    "op": {
                      "type": "string"
                    },
                    "method": {
                      "type": "string",
                      "enum": [
                        "GET",
                        "POST",
                        "PUT",
                        "PATCH",
                        "DELETE"
                      ]
                    },
                    "path": {
                      "type": "string"
                    },
                    "url": {
                      "type": "string",
                      "format": "uri"
                    },
                    "tool": {
                      "type": "string",
                      "enum": [
                        "query_app",
                        "mutate_app"
                      ],
                      "description": "MCP tool to invoke this op: query_app for read-only, mutate_app otherwise."
                    },
                    "discoveredFrom": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "enum": [
                          "manifest_export",
                          "module_route"
                        ]
                      }
                    },
                    "manifestExport": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "storageKeys": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request describe-app --param id=VALUE"
  },
  {
    "id": "disable-app-template",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/template-listing/disable",
    "summary": "Disable a Template",
    "description": "User-gated (`chrm_user_*` or session); requires `app:template-edit`. Disables copying and unlists the Template while preserving draft content.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Disabled Template.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "listing"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "listing": {
            "type": "object",
            "required": [
              "appId",
              "creator",
              "builders",
              "draft",
              "resolved",
              "templateEnabled",
              "listed",
              "validation",
              "publicUrl"
            ],
            "properties": {
              "appId": {
                "type": "string",
                "format": "uuid"
              },
              "creator": {
                "type": "object",
                "required": [
                  "handle"
                ],
                "properties": {
                  "handle": {
                    "type": "string"
                  }
                }
              },
              "builders": {
                "type": "integer",
                "minimum": 0
              },
              "draft": {
                "allOf": [
                  {
                    "type": "object",
                    "required": [
                      "title",
                      "summary",
                      "contentMarkdown",
                      "category",
                      "cover",
                      "gallery"
                    ],
                    "properties": {
                      "title": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "summary": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "contentMarkdown": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "category": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "enum": [
                          "business",
                          "developer-tools",
                          "education",
                          "entertainment",
                          "lifestyle",
                          "productivity",
                          "utilities",
                          null
                        ]
                      },
                      "cover": {
                        "oneOf": [
                          {
                            "type": "object",
                            "required": [
                              "id",
                              "kind",
                              "assetKey",
                              "url",
                              "alt",
                              "caption",
                              "position"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "kind": {
                                "type": "string",
                                "enum": [
                                  "cover",
                                  "screenshot"
                                ]
                              },
                              "assetKey": {
                                "type": "string"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "alt": {
                                "type": "string"
                              },
                              "caption": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              },
                              "position": {
                                "type": "integer",
                                "minimum": 0
                              }
                            }
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "gallery": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "id",
                            "kind",
                            "assetKey",
                            "url",
                            "alt",
                            "caption",
                            "position"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "cover",
                                "screenshot"
                              ]
                            },
                            "assetKey": {
                              "type": "string"
                            },
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "alt": {
                              "type": "string"
                            },
                            "caption": {
                              "type": [
                                "string",
                                "null"
                              ]
                            },
                            "position": {
                              "type": "integer",
                              "minimum": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "object",
                    "required": [
                      "legacyFallback"
                    ],
                    "properties": {
                      "legacyFallback": {
                        "type": "boolean"
                      }
                    }
                  }
                ]
              },
              "resolved": {
                "type": "object",
                "required": [
                  "title",
                  "summary",
                  "contentMarkdown",
                  "category",
                  "cover",
                  "gallery"
                ],
                "properties": {
                  "title": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "summary": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "contentMarkdown": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "category": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "business",
                      "developer-tools",
                      "education",
                      "entertainment",
                      "lifestyle",
                      "productivity",
                      "utilities",
                      null
                    ]
                  },
                  "cover": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "kind",
                          "assetKey",
                          "url",
                          "alt",
                          "caption",
                          "position"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "kind": {
                            "type": "string",
                            "enum": [
                              "cover",
                              "screenshot"
                            ]
                          },
                          "assetKey": {
                            "type": "string"
                          },
                          "url": {
                            "type": "string",
                            "format": "uri"
                          },
                          "alt": {
                            "type": "string"
                          },
                          "caption": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "position": {
                            "type": "integer",
                            "minimum": 0
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "gallery": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "kind",
                        "assetKey",
                        "url",
                        "alt",
                        "caption",
                        "position"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "kind": {
                          "type": "string",
                          "enum": [
                            "cover",
                            "screenshot"
                          ]
                        },
                        "assetKey": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string",
                          "format": "uri"
                        },
                        "alt": {
                          "type": "string"
                        },
                        "caption": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "position": {
                          "type": "integer",
                          "minimum": 0
                        }
                      }
                    }
                  }
                }
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "listed": {
                "type": "boolean"
              },
              "validation": {
                "type": "object",
                "required": [
                  "complete",
                  "missingFields"
                ],
                "properties": {
                  "complete": {
                    "type": "boolean"
                  },
                  "missingFields": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "title",
                        "summary"
                      ]
                    }
                  }
                }
              },
              "publicUrl": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request disable-app-template --param appId=VALUE"
  },
  {
    "id": "enable-app-template",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/template-listing/enable",
    "summary": "Enable a Template",
    "description": "User-gated (`chrm_user_*` or session); requires `app:template-edit`. Enables copying while preserving listing state and draft content.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Enabled Template.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "listing"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "listing": {
            "type": "object",
            "required": [
              "appId",
              "creator",
              "builders",
              "draft",
              "resolved",
              "templateEnabled",
              "listed",
              "validation",
              "publicUrl"
            ],
            "properties": {
              "appId": {
                "type": "string",
                "format": "uuid"
              },
              "creator": {
                "type": "object",
                "required": [
                  "handle"
                ],
                "properties": {
                  "handle": {
                    "type": "string"
                  }
                }
              },
              "builders": {
                "type": "integer",
                "minimum": 0
              },
              "draft": {
                "allOf": [
                  {
                    "type": "object",
                    "required": [
                      "title",
                      "summary",
                      "contentMarkdown",
                      "category",
                      "cover",
                      "gallery"
                    ],
                    "properties": {
                      "title": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "summary": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "contentMarkdown": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "category": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "enum": [
                          "business",
                          "developer-tools",
                          "education",
                          "entertainment",
                          "lifestyle",
                          "productivity",
                          "utilities",
                          null
                        ]
                      },
                      "cover": {
                        "oneOf": [
                          {
                            "type": "object",
                            "required": [
                              "id",
                              "kind",
                              "assetKey",
                              "url",
                              "alt",
                              "caption",
                              "position"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "kind": {
                                "type": "string",
                                "enum": [
                                  "cover",
                                  "screenshot"
                                ]
                              },
                              "assetKey": {
                                "type": "string"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "alt": {
                                "type": "string"
                              },
                              "caption": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              },
                              "position": {
                                "type": "integer",
                                "minimum": 0
                              }
                            }
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "gallery": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "id",
                            "kind",
                            "assetKey",
                            "url",
                            "alt",
                            "caption",
                            "position"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "cover",
                                "screenshot"
                              ]
                            },
                            "assetKey": {
                              "type": "string"
                            },
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "alt": {
                              "type": "string"
                            },
                            "caption": {
                              "type": [
                                "string",
                                "null"
                              ]
                            },
                            "position": {
                              "type": "integer",
                              "minimum": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "object",
                    "required": [
                      "legacyFallback"
                    ],
                    "properties": {
                      "legacyFallback": {
                        "type": "boolean"
                      }
                    }
                  }
                ]
              },
              "resolved": {
                "type": "object",
                "required": [
                  "title",
                  "summary",
                  "contentMarkdown",
                  "category",
                  "cover",
                  "gallery"
                ],
                "properties": {
                  "title": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "summary": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "contentMarkdown": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "category": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "business",
                      "developer-tools",
                      "education",
                      "entertainment",
                      "lifestyle",
                      "productivity",
                      "utilities",
                      null
                    ]
                  },
                  "cover": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "kind",
                          "assetKey",
                          "url",
                          "alt",
                          "caption",
                          "position"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "kind": {
                            "type": "string",
                            "enum": [
                              "cover",
                              "screenshot"
                            ]
                          },
                          "assetKey": {
                            "type": "string"
                          },
                          "url": {
                            "type": "string",
                            "format": "uri"
                          },
                          "alt": {
                            "type": "string"
                          },
                          "caption": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "position": {
                            "type": "integer",
                            "minimum": 0
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "gallery": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "kind",
                        "assetKey",
                        "url",
                        "alt",
                        "caption",
                        "position"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "kind": {
                          "type": "string",
                          "enum": [
                            "cover",
                            "screenshot"
                          ]
                        },
                        "assetKey": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string",
                          "format": "uri"
                        },
                        "alt": {
                          "type": "string"
                        },
                        "caption": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "position": {
                          "type": "integer",
                          "minimum": 0
                        }
                      }
                    }
                  }
                }
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "listed": {
                "type": "boolean"
              },
              "validation": {
                "type": "object",
                "required": [
                  "complete",
                  "missingFields"
                ],
                "properties": {
                  "complete": {
                    "type": "boolean"
                  },
                  "missingFields": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "title",
                        "summary"
                      ]
                    }
                  }
                }
              },
              "publicUrl": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request enable-app-template --param appId=VALUE"
  },
  {
    "id": "get-app-activity",
    "method": "GET",
    "path": "/app/{id}/activity",
    "summary": "Read the app's durable runtime-failure events",
    "description": "Owner-only. Returns the app's own `api_proxy_result`, `image_proxy_result` (external image failures), `diag_report` (runtime JS errors, CSP violations), `contract_validation`, `app_load_error`, and `render_token_revoked` events from durable storage — use this after publishing to learn what broke at runtime. Unlike `GET /app/{id}/diag` (in-memory ring buffer, always lost on deploy), these rows are meant to survive deploys, but most kinds here are telemetry the server can shed under sustained load rather than block a request on: `api_proxy_result` and `render_token_revoked` at the telemetry lane's in-flight write budget, and `diag_report`, `image_proxy_result`, `app_load_error` in the in-process queue those flood-prone kinds share. Only `contract_validation` (and the audit kinds this endpoint does not return) write synchronously and are never shed. Requires the app token or the owner's user token; render tokens and claim cookies are rejected. Not to be confused with `GET /app/{id}/events`, the live-state SSE stream.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Comma-separated subset of `api_proxy_result,image_proxy_result,diag_report,contract_validation,app_load_error,render_token_revoked`. Unknown kinds are a 400.",
        "in": "query",
        "name": "kinds",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "ISO-8601 cutoff; only events at or after this instant are returned. Clamped to the plan window.",
        "in": "query",
        "name": "since",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "description": "Max events to return. Default 100, capped at 500.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "default": 100,
          "maximum": 500
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Newest-first runtime-failure events",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "value"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "value": {
            "type": "object",
            "required": [
              "items",
              "retention"
            ],
            "properties": {
              "retention": {
                "type": "object",
                "required": [
                  "tier",
                  "hours",
                  "since",
                  "truncated"
                ],
                "description": "The plan window this read used: 24 hours on Free, 30 days on Pro, 90 days on Business. Older events are hidden, not deleted.",
                "properties": {
                  "tier": {
                    "type": "string",
                    "enum": [
                      "free",
                      "pro",
                      "business",
                      "enterprise"
                    ]
                  },
                  "hours": {
                    "type": "integer",
                    "description": "Length of the plan window."
                  },
                  "since": {
                    "type": "string",
                    "format": "date-time",
                    "description": "The cutoff this read used."
                  },
                  "truncated": {
                    "type": "boolean",
                    "description": "True when the plan window set the cutoff."
                  }
                }
              },
              "items": {
                "type": "array",
                "description": "Newest-first durable runtime-failure events for this app, inside the plan window. Bounded by per-kind insert caps and a 90-day prune.",
                "items": {
                  "type": "object",
                  "required": [
                    "ts",
                    "kind",
                    "revision",
                    "summary",
                    "data"
                  ],
                  "properties": {
                    "ts": {
                      "type": "string",
                      "format": "date-time"
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "api_proxy_result",
                        "image_proxy_result",
                        "diag_report",
                        "contract_validation",
                        "app_load_error",
                        "render_token_revoked"
                      ]
                    },
                    "revision": {
                      "type": "integer",
                      "minimum": 0,
                      "example": 4,
                      "examples": [
                        0,
                        4
                      ],
                      "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
                    },
                    "summary": {
                      "type": "string",
                      "description": "Compact one-line description of the event."
                    },
                    "data": {
                      "type": "object",
                      "description": "Kind-specific redacted payload (no stacks, no tokens, no source bytes)."
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-activity --param id=VALUE"
  },
  {
    "id": "get-app-activity-timeline",
    "method": "GET",
    "path": "/api/v1/apps/{appId}/activity",
    "summary": "Get an app’s activity timeline",
    "description": "Requires a personal access token or session cookie and `app:manage`. Newest-first feed merging published versions, renders/runs, API-call outcomes, sharing changes, and feedback. Each entry carries only the fields its kind allows — never a viewer id, an actor, a grantee, or an email address. The feed covers the plan’s window: 24 hours on Free, 30 days on Pro, 90 days on Business. `retention` gives the cutoff used. Retention is a rolling window, not a compliance audit log.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      {
        "description": "Comma-separated allow-list of event kinds. Kinds outside the owner-readable set are ignored.",
        "in": "query",
        "name": "kinds",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Inclusive ISO-8601 cutoff.",
        "in": "query",
        "name": "since",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "description": "Exclusive ISO-8601 cutoff — the load-more cursor. Pass the `ts` of the oldest entry you already have, together with `beforeId`, for an exact page boundary.",
        "in": "query",
        "name": "before",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "description": "The `id` of the oldest entry you already have. Pairs with `before` for an exact keyset cursor — without it, entries sharing `before`’s exact millisecond can be skipped. Ignored if `before` is absent.",
        "in": "query",
        "name": "beforeId",
        "required": false,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      {
        "description": "Defaults to 100, capped at 500.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Merged activity timeline for the app.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "appId",
          "items",
          "hasMore",
          "retention"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "appId": {
            "type": "string",
            "format": "uuid"
          },
          "hasMore": {
            "type": "boolean",
            "description": "True when older entries exist. Fetch them with `before` and `beforeId` set from the oldest entry returned."
          },
          "retention": {
            "type": "object",
            "required": [
              "tier",
              "hours",
              "since",
              "truncated"
            ],
            "description": "The plan window this read used. Older events are hidden, not deleted.",
            "properties": {
              "tier": {
                "type": "string",
                "enum": [
                  "free",
                  "pro",
                  "business",
                  "enterprise"
                ]
              },
              "hours": {
                "type": "integer",
                "description": "Length of the plan window."
              },
              "since": {
                "type": "string",
                "format": "date-time",
                "description": "The cutoff this read used."
              },
              "truncated": {
                "type": "boolean",
                "description": "True when the plan window set the cutoff."
              }
            }
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "ts",
                "kind",
                "summary",
                "data"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Pass back as `beforeId` (with `before`) to page further."
                },
                "ts": {
                  "type": "string",
                  "format": "date-time"
                },
                "kind": {
                  "type": "string"
                },
                "version": {
                  "type": [
                    "integer",
                    "null"
                  ]
                },
                "summary": {
                  "type": "string"
                },
                "data": {
                  "type": "object"
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-activity-timeline --param appId=VALUE"
  },
  {
    "id": "get-app-agent-descriptor",
    "method": "GET",
    "path": "/app/{id}/agent.json",
    "summary": "Get an app's agent description without changing the app",
    "description": "Side-effect-free sibling of the page gate: no auto-claim, no token mint, no cookie, no mutating telemetry. A public App or listed Template returns the full descriptor to anyone, with `operations[].input`/`output`/`examples` gated on `app:read` (owner, accepted share grant, team membership, or a bearer token) — an anonymous caller sees discovery-level operation fields only. An enabled-unlisted Template remains private without `app:read`, as does any other private App. Those callers — including an unclaimed app's claim-cookie holder, which grants `app:run` but never `app:read` — get the minimal stub (`AppDescriptorStub`). Reachable via both the `/app/{id}` UUID form and the `/{handle}/{app-name}` friendly form (byte-identical `id` + `canonical_url`), and advertised from the served page's `<link rel=\"alternate\" type=\"application/json\">` and matching `Link:` HTTP header.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The full descriptor (manifest, operations, http_api, mcp, auth) or, for an unauthorized caller on a private app, the minimal `AppDescriptorStub`.",
      "schema": {
        "oneOf": [
          {
            "type": "object",
            "required": [
              "type",
              "schema_version",
              "id",
              "revision",
              "display_name",
              "app_name",
              "visibility",
              "authorized",
              "canonical_url",
              "when_to_use",
              "author_provided",
              "operations",
              "http_api",
              "mcp",
              "auth"
            ],
            "properties": {
              "type": {
                "type": "string",
                "const": "charming.app-descriptor"
              },
              "schema_version": {
                "type": "string",
                "const": "v1"
              },
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "revision": {
                "type": "integer",
                "minimum": 0,
                "example": 4,
                "examples": [
                  0,
                  4
                ],
                "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
              },
              "display_name": {
                "type": "string"
              },
              "app_name": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "visibility": {
                "type": "string",
                "enum": [
                  "public",
                  "remixable",
                  "private"
                ]
              },
              "authorized": {
                "type": "boolean"
              },
              "canonical_url": {
                "type": "string",
                "format": "uri"
              },
              "when_to_use": {
                "type": "string"
              },
              "author_provided": {
                "type": "object",
                "additionalProperties": true
              },
              "operations": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": true
                }
              },
              "http_api": {
                "type": "object",
                "additionalProperties": true
              },
              "mcp": {
                "type": "object",
                "additionalProperties": true
              },
              "auth": {
                "type": "object",
                "additionalProperties": true
              },
              "advisories": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          {
            "type": "object",
            "description": "Fail-closed descriptor for a private app when the caller lacks app:read. It omits the app ID, revision, source state, and operations.",
            "required": [
              "type",
              "schema_version",
              "visibility",
              "authorized",
              "message",
              "auth"
            ],
            "properties": {
              "type": {
                "type": "string",
                "const": "charming.app-descriptor"
              },
              "schema_version": {
                "type": "string",
                "const": "v1"
              },
              "visibility": {
                "type": "string",
                "const": "private"
              },
              "authorized": {
                "type": "boolean",
                "const": false
              },
              "message": {
                "type": "string"
              },
              "auth": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        ]
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-agent-descriptor --param id=VALUE"
  },
  {
    "id": "get-app-build",
    "method": "GET",
    "path": "/api/v1/app-builds/{buildId}",
    "summary": "Read an app build and its accepted source",
    "description": "Read progress or the retained terminal result using current user source access. Set include_source=true to inspect the exact accepted input. Only published means the app is live. Status remains available after authoring cohort removal. Accept: text/html renders progress and terminal results; pending pages refresh this status resource and published pages redirect to the actual app URL.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "buildId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "",
        "in": "query",
        "name": "include_source",
        "required": false,
        "schema": {
          "type": "boolean"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Current build operation.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "buildId",
          "intent",
          "state",
          "sourceEtag",
          "statusUrl",
          "attempts",
          "acceptedAt",
          "updatedAt",
          "finishedAt",
          "elapsedMs",
          "lockState",
          "inputDigest",
          "queueDeadline",
          "deadline",
          "inspectionExpiresAt",
          "idempotencyExpiresAt"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "buildId": {
            "type": "string"
          },
          "intent": {
            "type": "string",
            "enum": [
              "create",
              "update",
              "migrate",
              "restore",
              "copy"
            ]
          },
          "state": {
            "type": "string",
            "enum": [
              "queued",
              "resolving",
              "building",
              "validating",
              "published",
              "failed",
              "superseded",
              "canceled",
              "expired"
            ]
          },
          "sourceEtag": {
            "type": "string"
          },
          "statusUrl": {
            "type": "string",
            "format": "uri"
          },
          "retryAfterSeconds": {
            "type": "integer"
          },
          "appId": {
            "type": "string",
            "format": "uuid"
          },
          "revision": {
            "type": "integer",
            "minimum": 1,
            "description": "Published app source revision. Present only after successful publication."
          },
          "desiredRevision": {
            "type": "integer"
          },
          "activeRevision": {
            "type": "integer"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "attempts": {
            "type": "integer"
          },
          "acceptedAt": {
            "type": "string",
            "format": "date-time"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time"
          },
          "finishedAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "elapsedMs": {
            "type": "integer"
          },
          "lockState": {
            "type": "string",
            "enum": [
              "locked",
              "unresolved"
            ]
          },
          "inputDigest": {
            "type": "string"
          },
          "lockDigest": {
            "type": "string"
          },
          "resolvedDependencies": {
            "type": "object",
            "required": [
              "server",
              "client"
            ],
            "properties": {
              "server": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              },
              "client": {
                "type": "object",
                "additionalProperties": {
                  "type": "string"
                }
              }
            }
          },
          "queueDeadline": {
            "type": "string",
            "format": "date-time"
          },
          "deadline": {
            "type": "string",
            "format": "date-time"
          },
          "inspectionExpiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "idempotencyExpiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "source": {
            "type": "object",
            "required": [
              "module",
              "ui",
              "styles",
              "description"
            ],
            "properties": {
              "module": {
                "type": "string"
              },
              "ui": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "styles": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "description": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          },
          "error": {
            "type": "object",
            "required": [
              "kind",
              "message",
              "retryable"
            ],
            "properties": {
              "kind": {
                "type": "string"
              },
              "message": {
                "type": "string"
              },
              "retryable": {
                "type": "boolean"
              },
              "details": {
                "anyOf": [
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "execution",
                      "operationId"
                    ],
                    "properties": {
                      "execution": {
                        "type": "string",
                        "enum": [
                          "not_started",
                          "may_have_run"
                        ]
                      },
                      "operationId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "reservationId": {
                        "type": "string",
                        "minLength": 1
                      }
                    }
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "execution"
                    ],
                    "properties": {
                      "execution": {
                        "type": "string",
                        "enum": [
                          "may_have_run"
                        ]
                      }
                    }
                  }
                ]
              },
              "target": {
                "type": "string"
              },
              "specifier": {
                "type": "string"
              },
              "line": {
                "type": "integer"
              },
              "column": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-build --param buildId=VALUE"
  },
  {
    "id": "get-app-diag",
    "method": "GET",
    "path": "/app/{id}/diag",
    "summary": "Read the per-app runtime error ring buffer",
    "description": "Owner-only. Use this after a deploy to see whether the iframe surfaced runtime errors. 50-entry ring buffer; oldest entries roll off. Accepts `renderToken` so the in-page shell can fetch its own diag without cookies.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Ring buffer contents",
      "schema": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "value": {
            "type": "object",
            "properties": {
              "entries": {
                "type": "array",
                "description": "Most-recent-first ring buffer (50-entry cap per app).",
                "items": {
                  "type": "object",
                  "properties": {
                    "ts": {
                      "type": "string",
                      "format": "date-time"
                    },
                    "message": {
                      "type": "string"
                    },
                    "source": {
                      "type": "string"
                    },
                    "line": {
                      "type": "integer"
                    },
                    "col": {
                      "type": "integer"
                    },
                    "stack": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "appToken",
      "renderToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-diag --param id=VALUE"
  },
  {
    "id": "get-app-guide-prompt",
    "method": "GET",
    "path": "/api/prompts/charming-app-guide",
    "summary": "Fetch the canonical Charming authoring guide as Markdown",
    "description": "Same prose served as the `charming:app-guide` MCP prompt. Useful for agents that want the full authoring contract without going through MCP. The compatibility prompt paths redirect here.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "Markdown"
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-guide-prompt"
  },
  {
    "id": "get-app-openapi",
    "method": "GET",
    "path": "/app/{id}/openapi.json",
    "summary": "Per-app OpenAPI document derived from `export const routes`",
    "description": "Owner-only OpenAPI 3.1 document with one method-specific path entry per route. requestBody schema comes from route.inputSchema; the 200 response schema wraps route.outputSchema as `{ ok: true, value }`. Apps that do not declare `routes` get an empty `paths: {}` document.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Per-app OpenAPI document.",
      "schema": {
        "type": "object",
        "description": "OpenAPI 3.1 document describing this app’s `routes`. Conforms to https://spec.openapis.org/oas/v3.1.0 — the per-app shape is too dynamic to enumerate inline."
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-openapi --param id=VALUE"
  },
  {
    "id": "get-app-source",
    "method": "GET",
    "path": "/app/{id}/source",
    "summary": "Read the exact persisted source for an app",
    "description": "Returns the desired authored `module`, `ui`, and `styles` exactly as persisted, including pending or failed ESM edits, plus the required server revision and contract-aware metadata. Requires a real bearer token for the app or its owning user; render tokens and claim cookies are rejected. The `ETag: \"<N>\"` header carries revision N; pass it back as `If-Match` on PUT or PATCH to gate optimistic concurrency.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Exact persisted source payload",
      "schema": {
        "type": "object",
        "required": [
          "id",
          "url",
          "manifestId",
          "sourceManifestId",
          "displayName",
          "description",
          "revision",
          "appVersion",
          "manifestVersion",
          "capabilities",
          "claimed",
          "expiresAt",
          "source"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "manifestId": {
            "type": "string"
          },
          "sourceManifestId": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "example": 4,
            "examples": [
              0,
              4
            ],
            "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
          },
          "appVersion": {
            "type": "string",
            "description": "Canonical and migrated apps return decimal `String(revision)`. Legacy apps return their stored effective SemVer."
          },
          "manifestVersion": {
            "type": [
              "string",
              "null"
            ],
            "deprecated": true,
            "description": "Required compatibility field. Canonical and migrated apps return null; legacy apps return their stored contract date."
          },
          "$schema": {
            "type": "string",
            "format": "uri",
            "enum": [
              "https://charm.ing/schema/app-manifest/2026-07-31.json",
              "https://charm.ing/schema/app-manifest/2026-09-05.json"
            ],
            "description": "Exact dated schema URL for canonical or ESM source. Legacy source responses omit this field."
          },
          "capabilities": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "imports": {
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "oneOf": [
                    {
                      "enum": [
                        "charming:storage/kv@1.0",
                        "charming:storage/blob@1.0",
                        "charming:logging/emit@1.0",
                        "charming:network/fetch@1.0",
                        "charming:secrets/fetch@1.0",
                        "charming:browser/microphone@1.0",
                        "charming:browser/camera@1.0",
                        "charming:browser/geolocation@1.0",
                        "charming:browser/clipboard-read@1.0",
                        "charming:browser/display-capture@1.0",
                        "charming:browser/midi@1.0",
                        "charming:browser/device-motion@1.0",
                        "charming:browser/ambient-light@1.0",
                        "charming:browser/storage@1.0"
                      ]
                    },
                    {
                      "type": "string",
                      "pattern": "^charming:app/[a-z0-9][a-z0-9-]{0,63}@[0-9]+\\.[0-9]+(?:\\.[0-9]+)?$"
                    }
                  ]
                }
              }
            }
          },
          "claimed": {
            "type": "boolean"
          },
          "expiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "source": {
            "type": "object",
            "required": [
              "module",
              "ui",
              "styles"
            ],
            "properties": {
              "module": {
                "type": "string"
              },
              "ui": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "styles": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        },
        "oneOf": [
          {
            "title": "Canonical app source",
            "required": [
              "$schema"
            ],
            "properties": {
              "$schema": {
                "const": "https://charm.ing/schema/app-manifest/2026-07-31.json"
              },
              "manifestVersion": {
                "type": "null"
              }
            }
          },
          {
            "title": "ESM app source",
            "required": [
              "$schema"
            ],
            "properties": {
              "$schema": {
                "const": "https://charm.ing/schema/app-manifest/2026-09-05.json"
              },
              "manifestVersion": {
                "type": "null"
              }
            }
          },
          {
            "title": "Legacy app source",
            "not": {
              "required": [
                "$schema"
              ]
            },
            "properties": {
              "manifestVersion": {
                "type": "string"
              }
            }
          }
        ]
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-source --param id=VALUE"
  },
  {
    "id": "get-app-template-listing",
    "method": "GET",
    "path": "/api/v1/apps/{appId}/template-listing",
    "summary": "Get an editable Template listing",
    "description": "User-gated (`chrm_user_*` or session); requires `app:template-edit`. Returns authored listing fields, resolved legacy fallbacks, signed media URLs, validation state, and Template flags.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Editable Template listing.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "listing"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "listing": {
            "type": "object",
            "required": [
              "appId",
              "creator",
              "builders",
              "draft",
              "resolved",
              "templateEnabled",
              "listed",
              "validation",
              "publicUrl"
            ],
            "properties": {
              "appId": {
                "type": "string",
                "format": "uuid"
              },
              "creator": {
                "type": "object",
                "required": [
                  "handle"
                ],
                "properties": {
                  "handle": {
                    "type": "string"
                  }
                }
              },
              "builders": {
                "type": "integer",
                "minimum": 0
              },
              "draft": {
                "allOf": [
                  {
                    "type": "object",
                    "required": [
                      "title",
                      "summary",
                      "contentMarkdown",
                      "category",
                      "cover",
                      "gallery"
                    ],
                    "properties": {
                      "title": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "summary": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "contentMarkdown": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "category": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "enum": [
                          "business",
                          "developer-tools",
                          "education",
                          "entertainment",
                          "lifestyle",
                          "productivity",
                          "utilities",
                          null
                        ]
                      },
                      "cover": {
                        "oneOf": [
                          {
                            "type": "object",
                            "required": [
                              "id",
                              "kind",
                              "assetKey",
                              "url",
                              "alt",
                              "caption",
                              "position"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "kind": {
                                "type": "string",
                                "enum": [
                                  "cover",
                                  "screenshot"
                                ]
                              },
                              "assetKey": {
                                "type": "string"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "alt": {
                                "type": "string"
                              },
                              "caption": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              },
                              "position": {
                                "type": "integer",
                                "minimum": 0
                              }
                            }
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "gallery": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "id",
                            "kind",
                            "assetKey",
                            "url",
                            "alt",
                            "caption",
                            "position"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "cover",
                                "screenshot"
                              ]
                            },
                            "assetKey": {
                              "type": "string"
                            },
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "alt": {
                              "type": "string"
                            },
                            "caption": {
                              "type": [
                                "string",
                                "null"
                              ]
                            },
                            "position": {
                              "type": "integer",
                              "minimum": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "object",
                    "required": [
                      "legacyFallback"
                    ],
                    "properties": {
                      "legacyFallback": {
                        "type": "boolean"
                      }
                    }
                  }
                ]
              },
              "resolved": {
                "type": "object",
                "required": [
                  "title",
                  "summary",
                  "contentMarkdown",
                  "category",
                  "cover",
                  "gallery"
                ],
                "properties": {
                  "title": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "summary": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "contentMarkdown": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "category": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "business",
                      "developer-tools",
                      "education",
                      "entertainment",
                      "lifestyle",
                      "productivity",
                      "utilities",
                      null
                    ]
                  },
                  "cover": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "kind",
                          "assetKey",
                          "url",
                          "alt",
                          "caption",
                          "position"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "kind": {
                            "type": "string",
                            "enum": [
                              "cover",
                              "screenshot"
                            ]
                          },
                          "assetKey": {
                            "type": "string"
                          },
                          "url": {
                            "type": "string",
                            "format": "uri"
                          },
                          "alt": {
                            "type": "string"
                          },
                          "caption": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "position": {
                            "type": "integer",
                            "minimum": 0
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "gallery": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "kind",
                        "assetKey",
                        "url",
                        "alt",
                        "caption",
                        "position"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "kind": {
                          "type": "string",
                          "enum": [
                            "cover",
                            "screenshot"
                          ]
                        },
                        "assetKey": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string",
                          "format": "uri"
                        },
                        "alt": {
                          "type": "string"
                        },
                        "caption": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "position": {
                          "type": "integer",
                          "minimum": 0
                        }
                      }
                    }
                  }
                }
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "listed": {
                "type": "boolean"
              },
              "validation": {
                "type": "object",
                "required": [
                  "complete",
                  "missingFields"
                ],
                "properties": {
                  "complete": {
                    "type": "boolean"
                  },
                  "missingFields": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "title",
                        "summary"
                      ]
                    }
                  }
                }
              },
              "publicUrl": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-app-template-listing --param appId=VALUE"
  },
  {
    "id": "get-design-guide-prompt",
    "method": "GET",
    "path": "/api/prompts/charming-design-guide",
    "summary": "Fetch the Charming design guide as Markdown",
    "description": "Same prose served as the `charming:design-guide` MCP prompt — the default visual look for generated app UIs (override when the user asks for a different vibe). Fetch before authoring or restyling an app. The compatibility prompt paths redirect here.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "Markdown"
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-design-guide-prompt"
  },
  {
    "id": "get-http-message-signatures-directory",
    "method": "GET",
    "path": "/.well-known/http-message-signatures-directory",
    "summary": "Web Bot Auth signing-key directory (RFC 9421)",
    "description": "Returns a JWK Set advertising the Ed25519 public key Charming uses to sign outbound HTTP messages. Single-entry today: `{ keys: [{ kty: \"OKP\", crv: \"Ed25519\", kid, x, nbf, exp }] }`. `Content-Type: application/jwk-set+json`, `Cache-Control: public, max-age=600`. Storage v0: key is pinned via env vars or generated ephemerally per boot until `WEB_BOT_AUTH_PUBLIC_JWK`/`WEB_BOT_AUTH_KID`/`WEB_BOT_AUTH_NBF` are set on Railway.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "JWK Set with the active Web Bot Auth signing key(s)."
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-http-message-signatures-directory"
  },
  {
    "id": "get-oauth-authorization-server",
    "method": "GET",
    "path": "/.well-known/oauth-authorization-server",
    "summary": "OAuth/MCP discovery metadata (delegated to better-auth)",
    "description": "Returns the RFC 8414 authorization-server metadata document for the Charming auth surface. Consumed by MCP clients during the OAuth handshake. The base payload shape is owned by better-auth; Charming splices a WorkOS-style `agent_auth` extension block carrying `register_uri` (`/api/pair/start`), `claim_uri` (`/app/{id}/claim`), `revocation_uri` (`/api/token/{id}`), `skill` (`https://charm.ing/docs/technical-reference/authentication.md`), `identity_types_supported` (`[\"anonymous\"]`), and an `anonymous` sibling block with `credential_types_supported` (`[\"api_key\"]`).",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OAuth authorization-server discovery JSON.",
      "schema": {
        "type": "object",
        "description": "RFC 8414 authorization-server metadata (issuer, authorization_endpoint, token_endpoint, jwks_uri, …) plus the Charming `agent_auth` extension. Base schema is delegated to better-auth."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-oauth-authorization-server"
  },
  {
    "id": "get-oauth-authorization-server-mcp-chatgpt",
    "method": "GET",
    "path": "/.well-known/oauth-authorization-server/mcp/chatgpt",
    "summary": "OAuth authorization-server metadata for the ChatGPT MCP surface",
    "description": "Returns the RFC 8414 authorization-server metadata for the `/mcp/chatgpt` surface, at the path-inserted well-known URL a client derives from an issuer carrying that path. Reached only when that surface's protected-resource document names the surface as its own authorization server, which `CHARMING__SERVER__CHATGPT_AUTH_PROXY_ADVERTISED` decides. The same switch decides whether this document is served, so the pointer and its target appear together: while it is off nothing names this URL and asking for it answers 404. Differs from the origin-wide document in `issuer`, which claims the surface, and in `authorization_endpoint`, which names the marketing-site login proxy while the switch is on. Token, registration, and JWKS endpoints stay on this origin.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OAuth authorization-server discovery JSON scoped to /mcp/chatgpt.",
      "schema": {
        "type": "object",
        "description": "RFC 8414 authorization-server metadata (issuer, authorization_endpoint, token_endpoint, jwks_uri, …) plus the Charming `agent_auth` extension. Base schema is delegated to better-auth; `issuer` and `authorization_endpoint` are overridden."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-oauth-authorization-server-mcp-chatgpt"
  },
  {
    "id": "get-oauth-protected-resource",
    "method": "GET",
    "path": "/.well-known/oauth-protected-resource",
    "summary": "OAuth protected-resource metadata (delegated to better-auth)",
    "description": "Returns the RFC 9728 protected-resource metadata for the Charming API origin. Read by clients that treat the origin as the protected resource; a client asking about one MCP surface reads the path-scoped document under this path instead, which is what that surface names in its 401 `WWW-Authenticate` header.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OAuth protected-resource discovery JSON.",
      "schema": {
        "type": "object",
        "description": "RFC 9728 protected-resource metadata (resource, authorization_servers, scopes_supported, …). Schema is delegated to better-auth."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-oauth-protected-resource"
  },
  {
    "id": "get-oauth-protected-resource-mcp",
    "method": "GET",
    "path": "/.well-known/oauth-protected-resource/mcp",
    "summary": "OAuth protected-resource metadata for the default MCP surface",
    "description": "Returns the RFC 9728 path-scoped protected-resource metadata for the `/mcp` MCP surface, which is what its `WWW-Authenticate` challenge names on a 401. Identical to the origin-wide document except that `resource` names `/mcp` on this origin rather than the origin itself, so a client can check the document answers for the endpoint it called.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OAuth protected-resource discovery JSON scoped to /mcp.",
      "schema": {
        "type": "object",
        "description": "RFC 9728 protected-resource metadata (resource, authorization_servers, scopes_supported, …). Schema is delegated to better-auth; only `resource` is overridden."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-oauth-protected-resource-mcp"
  },
  {
    "id": "get-oauth-protected-resource-mcp-chatgpt",
    "method": "GET",
    "path": "/.well-known/oauth-protected-resource/mcp/chatgpt",
    "summary": "OAuth protected-resource metadata for the ChatGPT MCP surface",
    "description": "Returns the RFC 9728 path-scoped protected-resource metadata for the `/mcp/chatgpt` MCP surface, which is what its `WWW-Authenticate` challenge names on a 401. `resource` names `/mcp/chatgpt` on this origin rather than the origin itself, so a client can check the document answers for the endpoint it called. `authorization_servers` names the surface too while `CHARMING__SERVER__CHATGPT_AUTH_PROXY_ADVERTISED` is on, which is what sends this surface's clients to their own authorization-server document; otherwise it matches the origin-wide document.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OAuth protected-resource discovery JSON scoped to /mcp/chatgpt.",
      "schema": {
        "type": "object",
        "description": "RFC 9728 protected-resource metadata (resource, authorization_servers, scopes_supported, …). Schema is delegated to better-auth; only `resource` is overridden."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-oauth-protected-resource-mcp-chatgpt"
  },
  {
    "id": "get-oauth-protected-resource-mcp-inline",
    "method": "GET",
    "path": "/.well-known/oauth-protected-resource/mcp/inline",
    "summary": "OAuth protected-resource metadata for the inline MCP surface",
    "description": "Returns the RFC 9728 path-scoped protected-resource metadata for the `/mcp/inline` MCP surface, which is what its `WWW-Authenticate` challenge names on a 401. Identical to the origin-wide document except that `resource` names `/mcp/inline` on this origin rather than the origin itself, so a client can check the document answers for the endpoint it called.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OAuth protected-resource discovery JSON scoped to /mcp/inline.",
      "schema": {
        "type": "object",
        "description": "RFC 9728 protected-resource metadata (resource, authorization_servers, scopes_supported, …). Schema is delegated to better-auth; only `resource` is overridden."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-oauth-protected-resource-mcp-inline"
  },
  {
    "id": "get-openapi-spec",
    "method": "GET",
    "path": "/.well-known/openapi.json",
    "summary": "This document",
    "description": "Serves the canonical machine-readable OpenAPI 3.1 spec for the Charming API. The unversioned `/openapi.json` path 308s here.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "OpenAPI 3.1 spec",
      "schema": {
        "type": "object",
        "description": "OpenAPI 3.1 document. Conforms to https://spec.openapis.org/oas/v3.1.0 — the spec is too deep to enumerate inline."
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-openapi-spec"
  },
  {
    "id": "get-team-app-defaults",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/app-defaults",
    "summary": "Get team App defaults",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner or admin of the team.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The defaults applied to new and transferred team Apps.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "defaults"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "defaults": {
            "type": "object",
            "required": [
              "teamId",
              "generalAccessTier",
              "templateEnabled",
              "createdAt",
              "updatedAt"
            ],
            "properties": {
              "teamId": {
                "type": "string"
              },
              "generalAccessTier": {
                "type": "string",
                "enum": [
                  "invited-only",
                  "public-view",
                  "public-and-signed-in-use"
                ]
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "createdAt": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "updatedAt": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              }
            }
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-team-app-defaults --param teamId=VALUE"
  },
  {
    "id": "get-team-audit",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/audit",
    "summary": "Get a team’s audit trail",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner/admin of the team. Newest-first (unless `sort` says otherwise) feed of share/publish lifecycle events AND end-user activity (renders, API calls) for every app the team owns. Defaults to the trailing 7 days.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Defaults to 100, capped at 500.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        }
      },
      {
        "description": "Narrows to one app.",
        "in": "query",
        "name": "appId",
        "required": false,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      {
        "description": "A user id — narrows to events where that person is the actor OR the end-user viewer.",
        "in": "query",
        "name": "actor",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Narrows to one event kind. An unrecognized kind is rejected, not ignored.",
        "in": "query",
        "name": "kind",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Trailing days to include. Defaults to 7.",
        "in": "query",
        "name": "range",
        "required": false,
        "schema": {
          "type": "integer",
          "enum": [
            7,
            30,
            90
          ]
        }
      },
      {
        "description": "Order of the whole trail. Defaults to `createdAt:desc` (newest first); ties break by `id` in the same direction. An unknown value is rejected, not ignored. CSV exports honour it too.",
        "in": "query",
        "name": "sort",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "createdAt:desc",
            "createdAt:asc"
          ]
        }
      },
      {
        "description": "The load-more cursor: the `nextCursor` of the previous page, sent with the same `sort`. A cursor from a different sort, or one that does not decode, is rejected with a 400. CSV exports ignore it.",
        "in": "query",
        "name": "cursor",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "When `csv`, returns `text/csv` instead of JSON, at a higher row cap. Any other value falls through to JSON.",
        "in": "query",
        "name": "format",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "csv"
          ]
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The team’s audit trail, as JSON or (with `format=csv`) as `text/csv`.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "audit",
          "hasMore",
          "nextCursor"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "audit": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "kind",
                "appId",
                "appDisplayName",
                "actor",
                "client",
                "createdAtMs",
                "summary"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid"
                },
                "kind": {
                  "type": "string"
                },
                "appId": {
                  "type": "string",
                  "format": "uuid"
                },
                "appDisplayName": {
                  "type": "string"
                },
                "actor": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "description": "Null for an anonymous/public end-user viewer."
                },
                "client": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "enum": [
                    "Web",
                    "MCP",
                    null
                  ]
                },
                "createdAtMs": {
                  "type": "integer"
                },
                "summary": {
                  "type": "string"
                }
              }
            }
          },
          "hasMore": {
            "type": "boolean",
            "description": "True when more rows follow this page under the active sort."
          },
          "nextCursor": {
            "type": [
              "string",
              "null"
            ],
            "description": "Pass back as `cursor`, with the same `sort`, for the next page. Null on the last page."
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-team-audit --param teamId=VALUE"
  },
  {
    "id": "get-team-exposure",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/exposure",
    "summary": "Get a team’s exposure summary",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner/admin of the team. Tallies the same `deriveAppVisibility` counters the team app inventory shows, plus an `externalShares` attention count.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "When `csv`, returns `text/csv` (a single summary row) instead of JSON. Any other value falls through to JSON.",
        "in": "query",
        "name": "format",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "csv"
          ]
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The team’s exposure summary, as JSON or (with `format=csv`) as `text/csv`.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "exposure"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "exposure": {
            "type": "object",
            "required": [
              "public",
              "signed-in",
              "template",
              "shared",
              "private",
              "externalShares"
            ],
            "description": "Counts every team app exactly once, by the widest audience `deriveAppVisibility` assigns it, plus the count of shares whose grantee classifies external.",
            "properties": {
              "public": {
                "type": "integer"
              },
              "signed-in": {
                "type": "integer"
              },
              "template": {
                "type": "integer"
              },
              "shared": {
                "type": "integer"
              },
              "private": {
                "type": "integer"
              },
              "externalShares": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-team-exposure --param teamId=VALUE"
  },
  {
    "id": "get-widget-runtime-issue-handoff",
    "method": "GET",
    "path": "/api/v1/widget/apps/{appId}/overview/handoffs/{token}",
    "summary": "Resolve a private runtime issue handoff",
    "description": "Requires a personal access token (`chrm_user_*`) and `app:manage`. Browser sessions are refused. Resolves an unexpired handoff for the same user and app into a private agent prompt.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "token",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Short-lived private agent prompt.",
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "version",
          "prompt"
        ],
        "properties": {
          "version": {
            "type": "integer",
            "enum": [
              1
            ]
          },
          "prompt": {
            "type": "string"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request get-widget-runtime-issue-handoff --param appId=VALUE --param token=VALUE"
  },
  {
    "id": "leave-team",
    "method": "DELETE",
    "path": "/api/v1/teams/{teamId}/members/me",
    "summary": "Leave a team",
    "description": "Session cookie required. Personal access tokens are not accepted. Removes the caller’s membership. Refused (relayed verbatim) when the caller is the team’s sole owner.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Left the team."
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request leave-team --param teamId=VALUE"
  },
  {
    "id": "list-app-assets",
    "method": "GET",
    "path": "/app/{id}/assets",
    "summary": "List assets for an app",
    "description": "Returns all stored assets for the app. Auth posture: `requireAppAccess` (app token, user token, render token, or claim cookie).",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Asset list.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "assets"
        ],
        "description": "Stored assets for the app (newest-first).",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "assets": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "key",
                "contentType",
                "sizeBytes"
              ],
              "properties": {
                "key": {
                  "type": "string"
                },
                "contentType": {
                  "type": "string"
                },
                "sizeBytes": {
                  "type": "integer"
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "appToken",
      "renderToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-app-assets --param id=VALUE"
  },
  {
    "id": "list-app-secrets",
    "method": "GET",
    "path": "/app/{id}/secrets",
    "summary": "List the app secret NAMES (never values)",
    "description": "Owner-only. Returns the names of the secrets stored for this app so the owner can see what is set. Values are never returned by any endpoint — secrets are write-only from the dashboard and are only decrypted host-side when an app references one. Requires the owner's user token; app/render tokens are rejected.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The secret names for this app.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "names"
        ],
        "description": "Owner-visible list of secret NAMES (values are never echoed).",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "names": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-app-secrets --param id=VALUE"
  },
  {
    "id": "list-app-shares",
    "method": "GET",
    "path": "/api/v1/apps/{appId}/shares",
    "summary": "List an app’s direct shares",
    "description": "User-gated (`chrm_user_*` or session); requires `app:share`. Returns stable share ids and display labels without internal account ids or mutation authority.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Direct shares visible to the caller.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "shares"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "shares": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "grantee",
                "status",
                "role"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid"
                },
                "grantee": {
                  "type": "object",
                  "required": [
                    "kind",
                    "label"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string",
                      "enum": [
                        "account",
                        "email"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "handle": {
                      "type": "string",
                      "description": "The account grantee’s handle, which names their avatar at `/<handle>.png`. Absent for email invitations and accounts without a handle."
                    }
                  }
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "pending",
                    "accepted",
                    "invited"
                  ]
                },
                "role": {
                  "type": "string",
                  "enum": [
                    "collaborator",
                    "end-user",
                    "viewer"
                  ]
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-app-shares --param appId=VALUE"
  },
  {
    "id": "list-apps",
    "method": "GET",
    "path": "/app",
    "summary": "List your owned and shared apps, newest first",
    "description": "Paginated newest-first listing of apps the caller owns or has been granted access to. Use `cursor` (from the previous page) and `limit` to iterate. Each row carries its server revision, the `role` (owner | collaborator | end-user | viewer | team-admin | team-member), and a UUID-form `url` that redirects to the friendly owner-canonical URL.",
    "parameters": [
      {
        "description": "",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "default": 50
        }
      },
      {
        "description": "Opaque cursor returned as `nextCursor` from the previous page.",
        "in": "query",
        "name": "cursor",
        "required": false,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Page of apps",
      "schema": {
        "type": "object",
        "required": [
          "apps"
        ],
        "properties": {
          "apps": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "revision"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid"
                },
                "role": {
                  "type": "string",
                  "enum": [
                    "owner",
                    "collaborator",
                    "end-user",
                    "viewer",
                    "team-admin",
                    "team-member"
                  ],
                  "description": "`owner` = your app. `collaborator` = shared with you via an accepted invite (edit and run, never share/delete/transfer). `end-user` = shared use-and-write-data (run the app and write its data, but cannot edit the app source). `viewer` = shared read-only. `team-admin` / `team-member` = owned by a team you belong to. Non-owner rows carry the UUID-form `url`, which redirects to the owner-canonical URL."
                },
                "manifestId": {
                  "type": "string"
                },
                "displayName": {
                  "type": "string"
                },
                "revision": {
                  "type": "integer",
                  "minimum": 0,
                  "example": 4,
                  "examples": [
                    0,
                    4
                  ],
                  "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
                },
                "capabilities": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "imports": {
                      "type": "array",
                      "uniqueItems": true,
                      "items": {
                        "oneOf": [
                          {
                            "enum": [
                              "charming:storage/kv@1.0",
                              "charming:storage/blob@1.0",
                              "charming:logging/emit@1.0",
                              "charming:network/fetch@1.0",
                              "charming:secrets/fetch@1.0",
                              "charming:browser/microphone@1.0",
                              "charming:browser/camera@1.0",
                              "charming:browser/geolocation@1.0",
                              "charming:browser/clipboard-read@1.0",
                              "charming:browser/display-capture@1.0",
                              "charming:browser/midi@1.0",
                              "charming:browser/device-motion@1.0",
                              "charming:browser/ambient-light@1.0",
                              "charming:browser/storage@1.0"
                            ]
                          },
                          {
                            "type": "string",
                            "pattern": "^charming:app/[a-z0-9][a-z0-9-]{0,63}@[0-9]+\\.[0-9]+(?:\\.[0-9]+)?$"
                          }
                        ]
                      }
                    }
                  }
                },
                "url": {
                  "type": "string",
                  "format": "uri"
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time"
                },
                "updatedAt": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            }
          },
          "nextCursor": {
            "type": [
              "string",
              "null"
            ],
            "description": "Pass back as `cursor` query param to fetch the next page."
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-apps"
  },
  {
    "id": "list-routines",
    "method": "GET",
    "path": "/api/v1/routines",
    "summary": "List the caller's Routines",
    "description": "Session-gated. Lists every Routine on an app the caller can edit (holds `app:write` on): their own apps, their teams' apps, and apps shared with them as a collaborator.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "The caller's Routines.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "routines",
          "limits"
        ],
        "description": "The caller's Routines, and the Routine ceilings their plan allows.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "routines": {
            "type": "array",
            "items": {
              "type": "object",
              "description": "A declared op scheduled to run on a timer. The op is invoked with empty input, so it must declare no required input fields.",
              "required": [
                "id",
                "app_id",
                "op",
                "interval",
                "enabled",
                "disabled_reason",
                "next_run_at",
                "last_run_at",
                "last_outcome",
                "last_error",
                "consecutive_failures"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Public id, `routine_<uuid>` form."
                },
                "app_id": {
                  "type": "string",
                  "format": "uuid"
                },
                "op": {
                  "type": "string"
                },
                "interval": {
                  "type": "string",
                  "enum": [
                    "hourly",
                    "daily",
                    "weekly"
                  ]
                },
                "enabled": {
                  "type": "boolean"
                },
                "disabled_reason": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "enum": [
                    "owner",
                    "auto",
                    null
                  ]
                },
                "next_run_at": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "format": "date-time",
                  "description": "`null` while the Routine is disabled — the underlying schedule is preserved and reappears here once re-enabled, with no recomputation."
                },
                "last_run_at": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "format": "date-time"
                },
                "last_outcome": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "last_error": {
                  "type": [
                    "object",
                    "null"
                  ],
                  "required": [
                    "kind",
                    "message"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "consecutive_failures": {
                  "type": "integer"
                }
              }
            }
          },
          "limits": {
            "type": "object",
            "description": "The caller's own Routine ceilings, resolved from their plan. Read these rather than assuming a tier: a client that hardcodes the free numbers disables its create control for a paying owner the server would allow.",
            "required": [
              "routines_per_app",
              "routines_per_owner"
            ],
            "properties": {
              "routines_per_app": {
                "type": "integer"
              },
              "routines_per_owner": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-routines"
  },
  {
    "id": "list-team-apps",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/apps",
    "summary": "List a team’s app inventory",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner/admin of the team. Never includes a personal (user-owned) app, even one owned by a team member.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Defaults to 100, capped at 500.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        }
      },
      {
        "description": "Order of the whole inventory. Defaults to `updatedAt:desc` (most recently updated first); `name` sorts case-insensitively by display name. Ties break by `id` in the same direction. An unknown value is rejected, not ignored.",
        "in": "query",
        "name": "sort",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "updatedAt:desc",
            "updatedAt:asc",
            "name:asc",
            "name:desc"
          ]
        }
      },
      {
        "description": "The load-more cursor: the `nextCursor` of the previous page, sent with the same `sort`. A cursor from a different sort, or one that does not decode, is rejected with a 400.",
        "in": "query",
        "name": "cursor",
        "required": false,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The team’s app inventory.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "apps",
          "hasMore",
          "nextCursor"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "apps": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "appName",
                "displayName",
                "visibility",
                "createdByLabel",
                "shareCount",
                "updatedAtMs"
              ],
              "description": "One row in the team apps inventory.",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid"
                },
                "appName": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "description": "Friendly-URL slug."
                },
                "displayName": {
                  "type": "string"
                },
                "visibility": {
                  "type": "string",
                  "enum": [
                    "public",
                    "signed-in",
                    "template",
                    "shared",
                    "private"
                  ],
                  "description": "The widest audience that can reach the app."
                },
                "createdByLabel": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "description": "Display name of the account that created the app, null when no creator was recorded, and \"Former member\" when the creator has left the team or deleted their account."
                },
                "shareCount": {
                  "type": "integer",
                  "description": "Share grants (accepted and pending) plus pending email invitations."
                },
                "updatedAtMs": {
                  "type": "integer"
                }
              }
            }
          },
          "hasMore": {
            "type": "boolean",
            "description": "True when the team owns more apps than this page returned."
          },
          "nextCursor": {
            "type": [
              "string",
              "null"
            ],
            "description": "Pass back as `cursor`, with the same `sort`, for the next page. Null on the last page."
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-team-apps --param teamId=VALUE"
  },
  {
    "id": "list-team-egress",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/egress",
    "summary": "List a team’s egress ledger (declared hosts and API ops)",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner/admin of the team. `outbound-host` destinations are declared config with no call counts; `api-op` destinations are grouped `api_proxy_result` events with real counts.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Defaults to 100, capped at 500.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        }
      },
      {
        "description": "Narrow to destinations the given app declares or calls.",
        "in": "query",
        "name": "appId",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Order of the whole list before `limit` cuts it. Defaults to `lastSeen:desc` (most recently called first); an `outbound-host` destination has no `lastSeenMs` and sorts last either way. An unknown value is rejected, not ignored. CSV exports honour it too.",
        "in": "query",
        "name": "sort",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "lastSeen:desc",
            "lastSeen:asc",
            "destination:asc",
            "destination:desc"
          ]
        }
      },
      {
        "description": "When true, keeps only `api-op` destinations with a 4xx/5xx or errored call — an all-200 op vanishes. Never hides `outbound-host` destinations.",
        "in": "query",
        "name": "failedOnly",
        "required": false,
        "schema": {
          "type": "boolean"
        }
      },
      {
        "description": "Restricts the `api-op` group to events within this many days.",
        "in": "query",
        "name": "range",
        "required": false,
        "schema": {
          "type": "integer",
          "enum": [
            7,
            30,
            90
          ]
        }
      },
      {
        "description": "When `csv`, returns `text/csv` instead of JSON, at a higher row cap. Any other value falls through to JSON.",
        "in": "query",
        "name": "format",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "csv"
          ]
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The team’s egress ledger, as JSON or (with `format=csv`) as `text/csv`.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "destinations",
          "hasMore",
          "scanTruncated"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "destinations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "destination",
                "kind",
                "calls",
                "lastSeenMs",
                "failedCalls",
                "callers"
              ],
              "description": "One egress destination, discriminated by `kind`.",
              "properties": {
                "destination": {
                  "type": "string",
                  "description": "The declared host origin, or the `requestedOp` string."
                },
                "kind": {
                  "type": "string",
                  "enum": [
                    "outbound-host",
                    "api-op"
                  ]
                },
                "calls": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "description": "Null for `outbound-host` — config, not traffic."
                },
                "lastSeenMs": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "description": "Null for `outbound-host`."
                },
                "failedCalls": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "description": "Count of calls with a 4xx/5xx status or a non-null errorKind. Null for `outbound-host`."
                },
                "callers": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": [
                      "appId",
                      "appDisplayName"
                    ],
                    "properties": {
                      "appId": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "appDisplayName": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          },
          "hasMore": {
            "type": "boolean",
            "description": "True when the team has more destinations than this page returned."
          },
          "scanTruncated": {
            "type": "boolean",
            "description": "True when the underlying event scan hit its row cap before grouping — every `api-op` destination’s `calls`/`failedCalls` in this response is a lower bound, not the true count."
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-team-egress --param teamId=VALUE"
  },
  {
    "id": "list-team-people",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/people",
    "summary": "List a team’s people",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner/admin of the team. Every CURRENT team member with role, apps owned, apps created, last activity, and external shares granted.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Defaults to 500, the cap, so one response carries the whole roster of all but the largest teams.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        }
      },
      {
        "description": "Case-insensitive match against the member label (name, handle, or email).",
        "in": "query",
        "name": "q",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Order of the whole roster before `limit` cuts it. Defaults to `label:asc`. Ties fall to the member label, then the user id, ascending; a member with no recorded activity sorts as the earliest `lastActive`. An unknown value is rejected, not ignored. CSV exports honour it, and `q`, too.",
        "in": "query",
        "name": "sort",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "label:asc",
            "label:desc",
            "role:asc",
            "role:desc",
            "appsOwned:asc",
            "appsOwned:desc",
            "appsCreated:asc",
            "appsCreated:desc",
            "lastActive:asc",
            "lastActive:desc",
            "externalShares:asc",
            "externalShares:desc"
          ]
        }
      },
      {
        "description": "When `csv`, returns `text/csv` instead of JSON, at a higher row cap. Any other value falls through to JSON.",
        "in": "query",
        "name": "format",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "csv"
          ]
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The team’s people, as JSON or (with `format=csv`) as `text/csv`.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "people",
          "hasMore"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "people": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "userId",
                "label",
                "role",
                "appsOwned",
                "appsCreated",
                "lastActiveMs",
                "externalShareCount"
              ],
              "description": "One row in the People tab — a current team member with their app footprint.",
              "properties": {
                "userId": {
                  "type": "string"
                },
                "label": {
                  "type": "string"
                },
                "role": {
                  "type": "string"
                },
                "appsOwned": {
                  "type": "integer"
                },
                "appsCreated": {
                  "type": "integer"
                },
                "lastActiveMs": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "description": "Null (never epoch zero) for a member with no attributable events."
                },
                "externalShareCount": {
                  "type": "integer"
                }
              }
            }
          },
          "hasMore": {
            "type": "boolean",
            "description": "True when the team has more members than this page returned."
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-team-people --param teamId=VALUE"
  },
  {
    "id": "list-team-shares",
    "method": "GET",
    "path": "/api/v1/teams/{teamId}/shares",
    "summary": "List a team’s shares ledger",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner/admin of the team. Unions grants, invitations, and live share links across every app the team owns, newest first unless `sort` says otherwise.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Defaults to 100, capped at 500.",
        "in": "query",
        "name": "limit",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        }
      },
      {
        "description": "",
        "in": "query",
        "name": "appId",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Case-insensitive match against the grantee handle/email.",
        "in": "query",
        "name": "q",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "",
        "in": "query",
        "name": "scope",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "internal",
            "external"
          ]
        }
      },
      {
        "description": "",
        "in": "query",
        "name": "kind",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "person",
            "invite",
            "link"
          ]
        }
      },
      {
        "description": "",
        "in": "query",
        "name": "range",
        "required": false,
        "schema": {
          "type": "integer",
          "enum": [
            7,
            30,
            90
          ]
        }
      },
      {
        "description": "Order of the whole ledger, as `<column>:<direction>`. Defaults to `createdAt:desc` (newest first). Ties break by `id` in the same direction; a row with no grantee sorts last either way. An unknown value is rejected, not ignored. CSV exports honour it too.",
        "in": "query",
        "name": "sort",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "createdAt:desc",
            "createdAt:asc",
            "app:asc",
            "app:desc",
            "grantee:asc",
            "grantee:desc",
            "status:asc",
            "status:desc"
          ]
        }
      },
      {
        "description": "The load-more cursor: the `nextCursor` of the previous page, sent with the same `sort`. A cursor from a different sort, or one that does not decode, is rejected with a 400. CSV exports ignore it.",
        "in": "query",
        "name": "cursor",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "When `csv`, returns `text/csv` instead of JSON, at a higher row cap. Any other value falls through to JSON.",
        "in": "query",
        "name": "format",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "csv"
          ]
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "The team’s shares ledger, as JSON or (with `format=csv`) as `text/csv`.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "shares",
          "hasMore",
          "nextCursor"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "shares": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "kind",
                "appId",
                "appDisplayName",
                "grantee",
                "role",
                "scope",
                "status",
                "createdAtMs"
              ],
              "description": "One row in the shares ledger — a grant, an invitation, or a live share link, normalized to one shape.",
              "properties": {
                "id": {
                  "type": "string"
                },
                "kind": {
                  "type": "string",
                  "enum": [
                    "person",
                    "invite",
                    "link"
                  ]
                },
                "appId": {
                  "type": "string",
                  "format": "uuid"
                },
                "appDisplayName": {
                  "type": "string"
                },
                "grantee": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "description": "Handle or email; null for a link (nobody is behind the door yet)."
                },
                "role": {
                  "type": "string"
                },
                "scope": {
                  "type": "string",
                  "enum": [
                    "internal",
                    "external"
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "pending",
                    "accepted",
                    "active",
                    "redeemed",
                    "revoked"
                  ]
                },
                "createdAtMs": {
                  "type": "integer"
                }
              }
            }
          },
          "hasMore": {
            "type": "boolean",
            "description": "True when the team has more matching shares than this page returned."
          },
          "nextCursor": {
            "type": [
              "string",
              "null"
            ],
            "description": "Pass back as `cursor`, with the same `sort`, for the next page. Null on the last page."
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-team-shares --param teamId=VALUE"
  },
  {
    "id": "list-teams",
    "method": "GET",
    "path": "/api/v1/teams",
    "summary": "List the caller’s teams",
    "description": "User-gated (`chrm_user_*` or session). Every team the caller belongs to, with their role, member roster (owners first, caller flagged via `isYou`), and app-count rollup.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "The caller’s teams.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "teams"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "teams": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "teamId",
                "name",
                "slug",
                "role",
                "memberCount",
                "appCount",
                "members"
              ],
              "description": "One row in the caller’s team list.",
              "properties": {
                "teamId": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                },
                "slug": {
                  "type": "string"
                },
                "role": {
                  "type": "string",
                  "description": "The caller’s own role in this team."
                },
                "memberCount": {
                  "type": "integer"
                },
                "appCount": {
                  "type": "integer"
                },
                "members": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": [
                      "userId",
                      "memberId",
                      "name",
                      "image",
                      "handle",
                      "role",
                      "isYou"
                    ],
                    "description": "One member in a team roster. `memberId` is the membership-row id used by the member PATCH/DELETE endpoints (distinct from `userId`).",
                    "properties": {
                      "userId": {
                        "type": "string"
                      },
                      "memberId": {
                        "type": "string"
                      },
                      "name": {
                        "type": "string"
                      },
                      "image": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "handle": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "role": {
                        "type": "string",
                        "description": "Comma-joined role string (e.g. `owner`)."
                      },
                      "isYou": {
                        "type": "boolean"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-teams"
  },
  {
    "id": "list-tokens",
    "method": "GET",
    "path": "/api/token",
    "summary": "List the caller’s tokens (no plaintext, no hash)",
    "description": "Returns the caller's personal access token metadata: stable `id`, public `tokenPrefix`, optional `label`, `expiresAt`, last-used timestamp, and `createdAt`. Plaintext and hashed values are never echoed — store the plaintext returned by `POST /api/token`; if it's lost, revoke and mint a new one.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "Tokens",
      "schema": {
        "type": "object",
        "required": [
          "tokens"
        ],
        "description": "List of the caller's personal access tokens.",
        "properties": {
          "tokens": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "tokenPrefix",
                "expiresAt",
                "createdAt"
              ],
              "description": "Public metadata for one personal access token row. Plaintext and hash are never echoed.",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid"
                },
                "tokenPrefix": {
                  "type": "string"
                },
                "label": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "expiresAt": {
                  "type": "string",
                  "format": "date-time"
                },
                "lastUsedAt": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "format": "date-time"
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-tokens"
  },
  {
    "id": "list-webhooks",
    "method": "GET",
    "path": "/api/v1/webhooks",
    "summary": "List the caller's Webhooks",
    "description": "Session-gated. Lists every Webhook on an app the caller can edit (holds `app:write` on): their own apps, their teams' apps, and apps shared with them as a collaborator.",
    "parameters": [],
    "requestBody": null,
    "response": {
      "description": "The caller's Webhooks.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "webhooks",
          "limits"
        ],
        "description": "The caller's Webhooks, and the Webhook ceilings their plan allows.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "webhooks": {
            "type": "array",
            "items": {
              "type": "object",
              "description": "A declared op an external sender invokes by POSTing to `url` with the Webhook secret. The body is the op’s input.",
              "required": [
                "id",
                "app_id",
                "op",
                "name",
                "url",
                "secret_prefix",
                "enabled",
                "disabled_reason",
                "last_run_at",
                "last_outcome",
                "last_error",
                "consecutive_failures"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Public id, `webhook_<uuid>` form."
                },
                "app_id": {
                  "type": "string",
                  "format": "uuid"
                },
                "op": {
                  "type": "string"
                },
                "name": {
                  "type": "string",
                  "description": "The owner’s label; defaults to the op’s title, description, or identifier."
                },
                "url": {
                  "type": "string",
                  "description": "The delivery URL an external sender POSTs to."
                },
                "secret_prefix": {
                  "type": "string",
                  "description": "First characters of the secret, for matching a stored copy by eye."
                },
                "enabled": {
                  "type": "boolean"
                },
                "disabled_reason": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "enum": [
                    "owner",
                    null
                  ]
                },
                "last_run_at": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "format": "date-time"
                },
                "last_outcome": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "last_error": {
                  "type": [
                    "object",
                    "null"
                  ],
                  "required": [
                    "kind",
                    "message"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                },
                "consecutive_failures": {
                  "type": "integer"
                }
              }
            }
          },
          "limits": {
            "type": "object",
            "description": "The caller's own Webhook ceilings, resolved from their plan. Read these rather than assuming a tier.",
            "required": [
              "webhooks_per_app",
              "webhooks_per_owner"
            ],
            "properties": {
              "webhooks_per_app": {
                "type": "integer"
              },
              "webhooks_per_owner": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request list-webhooks"
  },
  {
    "id": "patch-app-source",
    "method": "PATCH",
    "path": "/app/{id}/source",
    "summary": "Apply exact-string find/replace edits to the persisted source",
    "description": "Applies an edits[] array to desired module/ui/styles. ESM saves require Idempotency-Key, return 202, and preserve active output until publication. An exact request-key replay returns the original operation before stale revision or edit matching checks. Each edit names a `bucket`, an exact `old_string` to match, and a `new_string` replacement. Requires `If-Match: \"<N>\"` carrying revision N from a fresh source response or ETag. A stale value returns 412 and surfaces the current ETag. Same auth as PUT.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Required for ESM saves. Reuse the same key, body, target and If-Match after response loss; a changed request with that key returns idempotency_conflict. Use a fresh key for each intentional save.",
        "in": "header",
        "name": "Idempotency-Key",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128,
          "pattern": "^[!-~]+$"
        }
      },
      {
        "description": "Validator `\"<N>\"` returned by a fresh GET /source, where N is its revision. The weak form `W/\"<N>\"` is accepted too, so a client can pass back the ETag verbatim even when a CDN rewrote it in transit.",
        "in": "header",
        "name": "If-Match",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "edits"
        ],
        "additionalProperties": false,
        "properties": {
          "migrate_contract": {
            "type": "boolean",
            "description": "Explicitly migrate when the edited source selects a new contract. ESM requires the exact schema, a request key and If-Match."
          },
          "edits": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "bucket",
                "old_string",
                "new_string"
              ],
              "properties": {
                "bucket": {
                  "type": "string",
                  "enum": [
                    "module",
                    "ui",
                    "styles"
                  ]
                },
                "old_string": {
                  "type": "string"
                },
                "new_string": {
                  "type": "string"
                },
                "replace_all": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      },
      "example": {
        "edits": []
      }
    },
    "response": {
      "description": "Edits applied; committed server revision returned.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "id",
          "revision"
        ],
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "id": {
            "type": "string"
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "example": 4,
            "examples": [
              0,
              4
            ],
            "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
          },
          "warnings": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Non-blocking publish feedback (#1126), present only when static validation found UI/backend contract mismatches. The write succeeded."
          }
        }
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request patch-app-source --param id=VALUE --param If-Match=VALUE --body @body.json"
  },
  {
    "id": "poll-pairing",
    "method": "POST",
    "path": "/api/pair/poll",
    "summary": "Poll a device_code until the user approves",
    "description": "Plaintext `chrm_user_*` token is returned exactly once when status flips to `approved`. Subsequent polls return `approved` with `already_delivered: true` and no token. The legacy `/pair/poll` path 308s here.",
    "parameters": [],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "device_code"
        ],
        "properties": {
          "device_code": {
            "type": "string"
          }
        }
      },
      "example": {
        "device_code": "string"
      }
    },
    "response": {
      "description": "Poll result",
      "schema": {
        "type": "object",
        "required": [
          "status"
        ],
        "description": "Poll result for a previously-minted device_code. `token` is delivered exactly once.",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "expired",
              "approved"
            ]
          },
          "token": {
            "type": "string",
            "description": "Only on the first poll after approval. `chrm_user_*` plaintext, irrecoverable."
          },
          "tokenPrefix": {
            "type": "string"
          },
          "already_delivered": {
            "type": "boolean"
          }
        }
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request poll-pairing --body @body.json"
  },
  {
    "id": "publish-app-template-listing",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/template-listing/publish",
    "summary": "Publish a Template listing",
    "description": "User-gated (`chrm_user_*` or session); requires `app:template-edit`. Validates the resulting title and summary, then enables and lists the Template atomically.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "title": {
            "type": [
              "string",
              "null"
            ]
          },
          "summary": {
            "type": [
              "string",
              "null"
            ]
          },
          "contentMarkdown": {
            "type": [
              "string",
              "null"
            ]
          },
          "category": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "business",
              "developer-tools",
              "education",
              "entertainment",
              "lifestyle",
              "productivity",
              "utilities",
              null
            ]
          },
          "cover": {
            "oneOf": [
              {
                "type": "object",
                "required": [
                  "assetKey",
                  "alt"
                ],
                "properties": {
                  "assetKey": {
                    "type": "string"
                  },
                  "alt": {
                    "type": "string"
                  },
                  "caption": {
                    "type": [
                      "string",
                      "null"
                    ]
                  }
                },
                "additionalProperties": false
              },
              {
                "type": "null"
              }
            ]
          },
          "gallery": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "assetKey",
                    "alt"
                  ],
                  "properties": {
                    "assetKey": {
                      "type": "string"
                    },
                    "alt": {
                      "type": "string"
                    },
                    "caption": {
                      "type": [
                        "string",
                        "null"
                      ]
                    }
                  },
                  "additionalProperties": false
                }
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {}
    },
    "response": {
      "description": "Published Template listing.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "listing"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "listing": {
            "type": "object",
            "required": [
              "appId",
              "creator",
              "builders",
              "draft",
              "resolved",
              "templateEnabled",
              "listed",
              "validation",
              "publicUrl"
            ],
            "properties": {
              "appId": {
                "type": "string",
                "format": "uuid"
              },
              "creator": {
                "type": "object",
                "required": [
                  "handle"
                ],
                "properties": {
                  "handle": {
                    "type": "string"
                  }
                }
              },
              "builders": {
                "type": "integer",
                "minimum": 0
              },
              "draft": {
                "allOf": [
                  {
                    "type": "object",
                    "required": [
                      "title",
                      "summary",
                      "contentMarkdown",
                      "category",
                      "cover",
                      "gallery"
                    ],
                    "properties": {
                      "title": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "summary": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "contentMarkdown": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "category": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "enum": [
                          "business",
                          "developer-tools",
                          "education",
                          "entertainment",
                          "lifestyle",
                          "productivity",
                          "utilities",
                          null
                        ]
                      },
                      "cover": {
                        "oneOf": [
                          {
                            "type": "object",
                            "required": [
                              "id",
                              "kind",
                              "assetKey",
                              "url",
                              "alt",
                              "caption",
                              "position"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "kind": {
                                "type": "string",
                                "enum": [
                                  "cover",
                                  "screenshot"
                                ]
                              },
                              "assetKey": {
                                "type": "string"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "alt": {
                                "type": "string"
                              },
                              "caption": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              },
                              "position": {
                                "type": "integer",
                                "minimum": 0
                              }
                            }
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "gallery": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "id",
                            "kind",
                            "assetKey",
                            "url",
                            "alt",
                            "caption",
                            "position"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "cover",
                                "screenshot"
                              ]
                            },
                            "assetKey": {
                              "type": "string"
                            },
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "alt": {
                              "type": "string"
                            },
                            "caption": {
                              "type": [
                                "string",
                                "null"
                              ]
                            },
                            "position": {
                              "type": "integer",
                              "minimum": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "object",
                    "required": [
                      "legacyFallback"
                    ],
                    "properties": {
                      "legacyFallback": {
                        "type": "boolean"
                      }
                    }
                  }
                ]
              },
              "resolved": {
                "type": "object",
                "required": [
                  "title",
                  "summary",
                  "contentMarkdown",
                  "category",
                  "cover",
                  "gallery"
                ],
                "properties": {
                  "title": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "summary": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "contentMarkdown": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "category": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "business",
                      "developer-tools",
                      "education",
                      "entertainment",
                      "lifestyle",
                      "productivity",
                      "utilities",
                      null
                    ]
                  },
                  "cover": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "kind",
                          "assetKey",
                          "url",
                          "alt",
                          "caption",
                          "position"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "kind": {
                            "type": "string",
                            "enum": [
                              "cover",
                              "screenshot"
                            ]
                          },
                          "assetKey": {
                            "type": "string"
                          },
                          "url": {
                            "type": "string",
                            "format": "uri"
                          },
                          "alt": {
                            "type": "string"
                          },
                          "caption": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "position": {
                            "type": "integer",
                            "minimum": 0
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "gallery": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "kind",
                        "assetKey",
                        "url",
                        "alt",
                        "caption",
                        "position"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "kind": {
                          "type": "string",
                          "enum": [
                            "cover",
                            "screenshot"
                          ]
                        },
                        "assetKey": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string",
                          "format": "uri"
                        },
                        "alt": {
                          "type": "string"
                        },
                        "caption": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "position": {
                          "type": "integer",
                          "minimum": 0
                        }
                      }
                    }
                  }
                }
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "listed": {
                "type": "boolean"
              },
              "validation": {
                "type": "object",
                "required": [
                  "complete",
                  "missingFields"
                ],
                "properties": {
                  "complete": {
                    "type": "boolean"
                  },
                  "missingFields": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "title",
                        "summary"
                      ]
                    }
                  }
                }
              },
              "publicUrl": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request publish-app-template-listing --param appId=VALUE --body @body.json"
  },
  {
    "id": "remove-team-member",
    "method": "DELETE",
    "path": "/api/v1/teams/{teamId}/members/{memberId}",
    "summary": "Remove a member from a team",
    "description": "Session cookie required. Personal access tokens are not accepted. The Better Auth org plugin gates the removal and its refusal is relayed verbatim. Use `DELETE …/members/me` to leave.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "memberId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Member removed."
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request remove-team-member --param teamId=VALUE --param memberId=VALUE"
  },
  {
    "id": "report-app-diag",
    "method": "POST",
    "path": "/app/{id}/diag/report",
    "summary": "Report a runtime error from the in-page shell (anonymous)",
    "description": "Public ingress for the rendered iframe’s `error` / `unhandledrejection` listeners. Body is capped at 16 KiB and rate-limited per (appId, IP). Agents normally read errors via `GET /app/{id}/diag`; they should not call this endpoint directly.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "required": [
          "message"
        ],
        "properties": {
          "message": {
            "type": "string"
          },
          "source": {
            "type": "string"
          },
          "line": {
            "type": "integer"
          },
          "col": {
            "type": "integer"
          },
          "stack": {
            "type": "string"
          }
        }
      },
      "example": {
        "message": "string"
      }
    },
    "response": {
      "description": "Recorded"
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request report-app-diag --param id=VALUE --body @body.json"
  },
  {
    "id": "report-app-load-error",
    "method": "POST",
    "path": "/app/{id}/load-error/report",
    "summary": "Report a caught app load failure from the in-page bridge (anonymous)",
    "description": "Public ingress for app load failures the bridge caught before they became an unhandled rejection — e.g. `bridge.resolve(manifestId)` 404s when the requested manifest does not exist in the caller’s scope. Body is capped at 2 KiB and rate-limited per (appId, IP). Agents normally read events via `GET /app/{id}/events`; they should not call this endpoint directly.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "required": [
          "manifestId"
        ],
        "properties": {
          "manifestId": {
            "type": "string"
          },
          "status": {
            "type": "integer"
          },
          "errorKind": {
            "type": "string"
          }
        }
      },
      "example": {
        "manifestId": "string"
      }
    },
    "response": {
      "description": "Recorded"
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request report-app-load-error --param id=VALUE --body @body.json"
  },
  {
    "id": "resend-team-invitation",
    "method": "POST",
    "path": "/api/v1/team-invitations/{invitationId}/resend",
    "summary": "Re-send a team invitation",
    "description": "Session cookie required. Personal access tokens are not accepted; owner/admin only (plugin gate, relayed). Issues a fresh invitation with a new expiry and re-fires the email, keeping one pending invite per address.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "invitationId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Invitation re-sent.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request resend-team-invitation --param invitationId=VALUE"
  },
  {
    "id": "resolve-app-manifest",
    "method": "GET",
    "path": "/app/resolve/{manifestId}",
    "summary": "Resolve a manifestId to an appId in the caller’s scope",
    "description": "Owner-only lookup: returns the `appId` for the caller’s app whose manifest `id` matches `manifestId`. Used by `window.charming.api(manifestId)` / `bridge.resolve()` to turn a manifest reference into a routable UUID.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "manifestId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Found",
      "schema": {
        "type": "object",
        "required": [
          "appId"
        ],
        "description": "Resolved app id for the supplied manifestId in the caller’s scope. `appId` is omitted when no match exists (404).",
        "properties": {
          "appId": {
            "type": "string",
            "format": "uuid"
          }
        }
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 2000,
    "usage": "charming api request resolve-app-manifest --param manifestId=VALUE"
  },
  {
    "id": "revoke-app-share",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/shares/revoke",
    "summary": "Revoke a share by grantee",
    "description": "User-gated (`chrm_user_*` or session); owner only (`app:share`). Removes a pending or accepted grant; idempotent (`removed: false` when nothing was there).",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "grantee"
        ],
        "properties": {
          "grantee": {
            "type": "string",
            "description": "Handle or email of the grantee."
          }
        },
        "additionalProperties": false
      },
      "example": {
        "grantee": "string"
      }
    },
    "response": {
      "description": "Revoked (or nothing to revoke).",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "removed"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "removed": {
            "type": "boolean"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request revoke-app-share --param appId=VALUE --body @body.json"
  },
  {
    "id": "revoke-app-share-by-id",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/shares/{shareId}/revoke",
    "summary": "Revoke a share",
    "description": "User-gated (`chrm_user_*` or session); requires `app:share`. Idempotently removes the grant or email invitation addressed by its opaque share id.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "shareId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Revoked, or no matching share remained.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "removed"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "removed": {
            "type": "boolean"
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request revoke-app-share-by-id --param appId=VALUE --param shareId=VALUE"
  },
  {
    "id": "revoke-token",
    "method": "DELETE",
    "path": "/api/token/{id}",
    "summary": "Revoke a token",
    "description": "The legacy `/token/{id}` path 308s here.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Revoked",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request revoke-token --param id=VALUE"
  },
  {
    "id": "set-app-icon",
    "method": "PUT",
    "path": "/app/{id}/icon",
    "summary": "Set the home-screen / favicon icon (emoji + bg)",
    "description": "Owner-only. Replaces the icon as a unit — both `emoji` and `bg` are required; there is no partial / PATCH semantics. Stricter than `PUT /app/{id}`: invalid `emoji` or `bg` is rejected with 400 `invalid_icon` rather than silently dropped and folded into `warnings[]` (that warn-and-drop contract is for agent publishes, where a typo must never fail). Last-writer-wins with a near-simultaneous agent publish; the rendered icon SVG / PNG caches revalidate on next read via their content-derived ETag.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "description": "Home-screen / favicon icon for `PUT /app/{id}/icon`. Same shape as `Icon`, but validated strictly: an invalid `emoji` or `bg` is rejected with 400 `invalid_icon` rather than silently dropped (the dashboard icon picker needs a hard rejection; `Icon`'s warn-and-drop contract is for agent publishes, where a typo must never fail).",
        "required": [
          "emoji",
          "bg"
        ],
        "properties": {
          "emoji": {
            "type": "string",
            "description": "A single emoji, rendered centered (e.g. `⚽`). Must contain at least one grapheme, or the request is rejected with 400 `invalid_icon`. A value with more than one grapheme (e.g. `⚽⚾`) is accepted, not rejected — only the first grapheme renders and the rest are silently dropped, the same truncation `Icon.emoji` discloses (`Extra glyphs are dropped.`); this endpoint is strict about invalid input, not about single-glyph input."
          },
          "bg": {
            "type": "string",
            "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
            "description": "Background color as a hex string (`#rgb`, `#rrggbb`, or `#rrggbbaa`). Named colors (`\"green\"`), `rgb()`/`hsl()`, and image URLs are rejected."
          }
        },
        "additionalProperties": false
      },
      "example": {
        "emoji": "string",
        "bg": "string"
      }
    },
    "response": {
      "description": "Icon updated; the response echoes the normalized icon.",
      "schema": {
        "type": "object",
        "required": [
          "icon"
        ],
        "properties": {
          "icon": {
            "type": "object",
            "description": "Home-screen / favicon icon for `PUT /app/{id}/icon`. Same shape as `Icon`, but validated strictly: an invalid `emoji` or `bg` is rejected with 400 `invalid_icon` rather than silently dropped (the dashboard icon picker needs a hard rejection; `Icon`'s warn-and-drop contract is for agent publishes, where a typo must never fail).",
            "required": [
              "emoji",
              "bg"
            ],
            "properties": {
              "emoji": {
                "type": "string",
                "description": "A single emoji, rendered centered (e.g. `⚽`). Must contain at least one grapheme, or the request is rejected with 400 `invalid_icon`. A value with more than one grapheme (e.g. `⚽⚾`) is accepted, not rejected — only the first grapheme renders and the rest are silently dropped, the same truncation `Icon.emoji` discloses (`Extra glyphs are dropped.`); this endpoint is strict about invalid input, not about single-glyph input."
              },
              "bg": {
                "type": "string",
                "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
                "description": "Background color as a hex string (`#rgb`, `#rrggbb`, or `#rrggbbaa`). Named colors (`\"green\"`), `rgb()`/`hsl()`, and image URLs are rejected."
              }
            },
            "additionalProperties": false
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request set-app-icon --param id=VALUE --body @body.json"
  },
  {
    "id": "set-app-public",
    "method": "PUT",
    "path": "/app/{id}/public",
    "summary": "Toggle whether anyone can open the app with no login",
    "description": "Owner-only. When `public: true`, anyone with the URL can open the live hosted App Viewer with no login and receives Viewer access (`app:read` only). Public visitors can read App data but cannot run mutating operations or edit source. Template and Listed are separate settings. When `public: false`, anonymous visitors can no longer open the hosted App. Existing App data is retained. Idempotent calls are no-ops.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "public"
        ],
        "properties": {
          "public": {
            "type": "boolean"
          }
        }
      },
      "example": {
        "public": false
      }
    },
    "response": {
      "description": "Public state updated.",
      "schema": {
        "type": "object",
        "required": [
          "public",
          "public_url"
        ],
        "description": "New public state plus the public URL when public is true.",
        "properties": {
          "public": {
            "type": "boolean"
          },
          "public_url": {
            "type": [
              "string",
              "null"
            ],
            "description": "Public URL when `public: true` (friendly `/{handle}/{app-name}` form when available, `/app/{id}` otherwise). Anyone can open the live hosted App Viewer with no login and read its data, but cannot change data or source. `null` when `public: false`."
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request set-app-public --param id=VALUE --body @body.json"
  },
  {
    "id": "set-app-remixable",
    "method": "PUT",
    "path": "/app/{id}/remixable",
    "summary": "Toggle Template copying and public listing",
    "description": "Owner-only legacy state surface. When `remixable: true`, people who already hold `app:read` on the source App can create an independent copy. `listed: true` also grants public discovery and copying without granting access to the live source App or its data. Listed always implies Template. When `remixable: false`, copying stops for new users, existing copies are unaffected, and Listed is cleared. `listed` is a patch: `true` publishes, `false` unpublishes, and omitting it preserves the current Listed state. This route cannot edit listing metadata; use `/api/v1/apps/{appId}/template-listing` for the title, summary, Markdown detail, category, cover, and gallery. Idempotent calls are no-ops.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "remixable"
        ],
        "properties": {
          "remixable": {
            "type": "boolean"
          },
          "listed": {
            "type": "boolean",
            "description": "Whether to also list the app in the public template directory. `true` lists it, `false` unlists it. Omit to leave the current listed state untouched. Only applies when `remixable: true`."
          }
        }
      },
      "example": {
        "remixable": false
      }
    },
    "response": {
      "description": "Remixable state updated.",
      "schema": {
        "type": "object",
        "required": [
          "remixable",
          "public_url",
          "listed"
        ],
        "description": "New remixable/listed state plus the shareable URL when remixable is true.",
        "properties": {
          "remixable": {
            "type": "boolean"
          },
          "public_url": {
            "type": [
              "string",
              "null"
            ],
            "description": "Shareable URL when `remixable: true` (friendly `/{handle}/{app-name}` form when available, `/app/{id}` otherwise); `null` when `remixable: false`."
          },
          "listed": {
            "type": "boolean",
            "description": "Whether the app is listed in the public template directory, reflecting the actual resulting state — not necessarily the request's `listed` field, since an omitted `listed` leaves the prior state unchanged. A listed app is always also `remixable: true`; always `false` when `remixable: false`."
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request set-app-remixable --param id=VALUE --body @body.json"
  },
  {
    "id": "set-app-starter-prompt",
    "method": "PUT",
    "path": "/app/{id}/starter-prompt",
    "summary": "Set or clear the authored chat-with-app starter prompt",
    "description": "Owner-only. When non-null, the authored text leads the prompt body for the \"Open in Claude / Open in ChatGPT / Copy prompt\" widget-menu actions, and the app's name, description, URL (and, for unclaimed apps, an access token) are appended automatically at render time. Write a generic getting-started instruction — do NOT embed the app's URL, or every copy's deeplink would point at the template instead of their own copy. Pass `null` (or an empty string) to clear and revert to the generic default. Idempotent: a repeated call with the same value is a no-op.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "starter_prompt"
        ],
        "properties": {
          "starter_prompt": {
            "type": "string",
            "nullable": true,
            "maxLength": 2000,
            "description": "Prompt body prefilled in the chat host when a visitor clicks \"Open in Claude\" / \"Open in ChatGPT\". Max 2000 characters. Pass `null` or `\"\"` to clear."
          }
        }
      },
      "example": {
        "starter_prompt": "string"
      }
    },
    "response": {
      "description": "Starter prompt updated.",
      "schema": {
        "type": "object",
        "required": [
          "starter_prompt"
        ],
        "description": "New starter-prompt value (or `null` after clearing).",
        "properties": {
          "starter_prompt": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request set-app-starter-prompt --param id=VALUE --body @body.json"
  },
  {
    "id": "start-pairing",
    "method": "POST",
    "path": "/api/pair/start",
    "summary": "Mint a device_code for an unauthenticated agent (RFC 8628-shaped)",
    "description": "Returns a `device_code` (agent-private) and a `user_code` (`CHRM-XXXXXX`, displayed to the user). Codes expire after 10 minutes. Agent then polls `POST /api/pair/poll` until status flips to `approved`. The legacy `/pair/start` path 308s here.",
    "parameters": [],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string",
            "maxLength": 80,
            "description": "Optional human-readable label. Surfaced to the user on the approval page so they know which agent they’re connecting."
          }
        }
      },
      "example": {}
    },
    "response": {
      "description": "Codes minted",
      "schema": {
        "type": "object",
        "required": [
          "device_code",
          "user_code",
          "verification_url",
          "polling_interval",
          "expires_in"
        ],
        "description": "RFC 8628-shaped device-code response. Poll `POST /api/pair/poll` until the user approves.",
        "properties": {
          "device_code": {
            "type": "string",
            "description": "Agent-private — store securely, never display or log. Anyone with the device_code can poll for the token."
          },
          "user_code": {
            "type": "string",
            "pattern": "^CHRM-[A-Z2-9]{6}$"
          },
          "verification_url": {
            "type": "string",
            "format": "uri"
          },
          "verification_url_complete": {
            "type": "string",
            "format": "uri"
          },
          "polling_interval": {
            "type": "integer"
          },
          "expires_in": {
            "type": "integer"
          }
        }
      }
    },
    "security": [],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request start-pairing --body @body.json"
  },
  {
    "id": "submit-app-feedback",
    "method": "POST",
    "path": "/app/{id}/feedback",
    "summary": "Submit durable feedback for an app",
    "description": "Owner-only durable feedback ingest. Auth posture matches `GET /app/{id}/diag` (`requireAppAccess`): app token, user token, render token, or claim cookie. Body is capped at 96 KiB wire / 16 KiB text / 64 KiB serialized `structuredData`. The MCP `submit_feedback` tool forces `source=\"agent\"` server-side; direct REST callers may set `source` to `user` or `auto-crash`.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "category"
        ],
        "properties": {
          "category": {
            "type": "string",
            "enum": [
              "bug",
              "crash",
              "enhancement",
              "praise",
              "other"
            ],
            "description": "Feedback category. `crash` requires `crashData` (or its snake_case alias) carrying at least `message`."
          },
          "source": {
            "type": "string",
            "enum": [
              "user",
              "agent",
              "auto-crash"
            ],
            "description": "Optional origin tag. Defaults to `user`. The MCP `submit_feedback` tool forces `agent` server-side; direct REST callers may pass `user` / `auto-crash` explicitly."
          },
          "text": {
            "type": "string",
            "maxLength": 16384,
            "description": "Free-form feedback body. 16384-character cap; oversize bodies return `text_too_large` (413)."
          },
          "structuredData": {
            "type": "object",
            "additionalProperties": true,
            "description": "Caller-supplied JSON payload (e.g. route, repro inputs). Serialized payload is capped at 65536 bytes; oversize payloads return `structured_data_too_large` (413). Snake_case alias `structured_data` is also accepted."
          },
          "crashData": {
            "type": "object",
            "required": [
              "message"
            ],
            "properties": {
              "message": {
                "type": "string"
              },
              "stack": {
                "type": "string"
              },
              "url": {
                "type": "string"
              },
              "userAgent": {
                "type": "string"
              },
              "traceId": {
                "type": "string"
              }
            },
            "description": "Crash details. Required when `category=crash`; optional otherwise. Snake_case alias `crash_data` is also accepted."
          }
        }
      },
      "example": {
        "category": "bug"
      }
    },
    "response": {
      "description": "Feedback recorded.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "value"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "value": {
            "type": "object",
            "required": [
              "id",
              "createdAt"
            ],
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "createdAt": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        }
      }
    },
    "security": [
      "appToken",
      "renderToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request submit-app-feedback --param id=VALUE --body @body.json"
  },
  {
    "id": "subscribe-app-events",
    "method": "GET",
    "path": "/app/{id}/events",
    "summary": "Subscribe to the live-state SSE stream for an app",
    "description": "Server-Sent Events stream of `state-changed` notifications. Each event id is `<server-epoch>:<rev>`; the browser `EventSource` replays via `Last-Event-ID` on reconnect, and the server emits a synthetic `state-changed` event with `source: \"reconnect-resync\"` and `result: null` whenever the client's id belongs to an older epoch or claims an unseen revision. The `overcapacity` event is emitted (and the stream closed) when the per-app subscriber cap is reached. Heartbeats are SSE comment lines (`: ping`) every 15s.\n\nAuth posture is broader than the owner endpoints: appToken, userToken, renderToken (bearer or `?t=` query), or the path-scoped `buildy_sse_<id>` HMAC cookie minted by the `/app/{id}` render-bridge when a render-token rendered the page. The `{}` (no-auth) option in `security` covers the cookie path — OpenAPI cannot model a per-app cookie name as a fixed scheme.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Last event id the client saw, in the `<epoch>:<rev>` form the server emits. Triggers a synthetic `reconnect-resync` event when the epoch differs or the rev is forward-jumped.",
        "in": "header",
        "name": "Last-Event-ID",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "URL-signed render token, equivalent to the `renderToken` bearer but carried in the query string for SSE connections from null-origin iframes that cannot attach Authorization headers.",
        "in": "query",
        "name": "t",
        "required": false,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Open SSE stream. Frames arrive as `event: state-changed` (or `event: overcapacity`) with a JSON `data:` payload. The stream stays open until the client disconnects, the per-app capacity cap is hit, or the server shuts down."
    },
    "security": [
      "appToken",
      "renderToken",
      "renderTokenQuery",
      "userToken"
    ],
    "streaming": true,
    "timeoutMs": 2000,
    "usage": "charming api request subscribe-app-events --param id=VALUE"
  },
  {
    "id": "transfer-app",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/transfer",
    "summary": "Transfer an app between the caller and a team",
    "description": "User-gated (`chrm_user_*` or session). With `teamId`: user→team (caller must hold `app:manage` on the app and be owner/admin of the team). Without: team→user transfer to the caller.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "teamId": {
            "type": [
              "string",
              "null"
            ],
            "description": "Destination team. Absent or null = transfer to the caller."
          },
          "keepExistingAppMembers": {
            "type": "boolean",
            "default": true,
            "description": "Keep direct grants, pending invitations, and active single-use links. Omitted means true."
          }
        },
        "additionalProperties": false
      },
      "example": {}
    },
    "response": {
      "description": "App transferred.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "userId",
          "teamId"
        ],
        "description": "Post-transfer owner scope: exactly one of userId/teamId is set.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "userId": {
            "type": [
              "string",
              "null"
            ]
          },
          "teamId": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request transfer-app --param appId=VALUE --body @body.json"
  },
  {
    "id": "unpublish-app-template-listing",
    "method": "POST",
    "path": "/api/v1/apps/{appId}/template-listing/unpublish",
    "summary": "Unpublish a Template listing",
    "description": "User-gated (`chrm_user_*` or session); requires `app:template-edit`. Removes the public listing while preserving Template enablement and draft content.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": null,
    "response": {
      "description": "Unpublished Template listing.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "listing"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "listing": {
            "type": "object",
            "required": [
              "appId",
              "creator",
              "builders",
              "draft",
              "resolved",
              "templateEnabled",
              "listed",
              "validation",
              "publicUrl"
            ],
            "properties": {
              "appId": {
                "type": "string",
                "format": "uuid"
              },
              "creator": {
                "type": "object",
                "required": [
                  "handle"
                ],
                "properties": {
                  "handle": {
                    "type": "string"
                  }
                }
              },
              "builders": {
                "type": "integer",
                "minimum": 0
              },
              "draft": {
                "allOf": [
                  {
                    "type": "object",
                    "required": [
                      "title",
                      "summary",
                      "contentMarkdown",
                      "category",
                      "cover",
                      "gallery"
                    ],
                    "properties": {
                      "title": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "summary": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "contentMarkdown": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "category": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "enum": [
                          "business",
                          "developer-tools",
                          "education",
                          "entertainment",
                          "lifestyle",
                          "productivity",
                          "utilities",
                          null
                        ]
                      },
                      "cover": {
                        "oneOf": [
                          {
                            "type": "object",
                            "required": [
                              "id",
                              "kind",
                              "assetKey",
                              "url",
                              "alt",
                              "caption",
                              "position"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "kind": {
                                "type": "string",
                                "enum": [
                                  "cover",
                                  "screenshot"
                                ]
                              },
                              "assetKey": {
                                "type": "string"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "alt": {
                                "type": "string"
                              },
                              "caption": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              },
                              "position": {
                                "type": "integer",
                                "minimum": 0
                              }
                            }
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "gallery": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "id",
                            "kind",
                            "assetKey",
                            "url",
                            "alt",
                            "caption",
                            "position"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "cover",
                                "screenshot"
                              ]
                            },
                            "assetKey": {
                              "type": "string"
                            },
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "alt": {
                              "type": "string"
                            },
                            "caption": {
                              "type": [
                                "string",
                                "null"
                              ]
                            },
                            "position": {
                              "type": "integer",
                              "minimum": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "object",
                    "required": [
                      "legacyFallback"
                    ],
                    "properties": {
                      "legacyFallback": {
                        "type": "boolean"
                      }
                    }
                  }
                ]
              },
              "resolved": {
                "type": "object",
                "required": [
                  "title",
                  "summary",
                  "contentMarkdown",
                  "category",
                  "cover",
                  "gallery"
                ],
                "properties": {
                  "title": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "summary": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "contentMarkdown": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "category": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "business",
                      "developer-tools",
                      "education",
                      "entertainment",
                      "lifestyle",
                      "productivity",
                      "utilities",
                      null
                    ]
                  },
                  "cover": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "kind",
                          "assetKey",
                          "url",
                          "alt",
                          "caption",
                          "position"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "kind": {
                            "type": "string",
                            "enum": [
                              "cover",
                              "screenshot"
                            ]
                          },
                          "assetKey": {
                            "type": "string"
                          },
                          "url": {
                            "type": "string",
                            "format": "uri"
                          },
                          "alt": {
                            "type": "string"
                          },
                          "caption": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "position": {
                            "type": "integer",
                            "minimum": 0
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "gallery": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "kind",
                        "assetKey",
                        "url",
                        "alt",
                        "caption",
                        "position"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "kind": {
                          "type": "string",
                          "enum": [
                            "cover",
                            "screenshot"
                          ]
                        },
                        "assetKey": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string",
                          "format": "uri"
                        },
                        "alt": {
                          "type": "string"
                        },
                        "caption": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "position": {
                          "type": "integer",
                          "minimum": 0
                        }
                      }
                    }
                  }
                }
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "listed": {
                "type": "boolean"
              },
              "validation": {
                "type": "object",
                "required": [
                  "complete",
                  "missingFields"
                ],
                "properties": {
                  "complete": {
                    "type": "boolean"
                  },
                  "missingFields": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "title",
                        "summary"
                      ]
                    }
                  }
                }
              },
              "publicUrl": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request unpublish-app-template-listing --param appId=VALUE"
  },
  {
    "id": "update-app",
    "method": "PUT",
    "path": "/app/{id}",
    "summary": "Update an existing app",
    "description": "Storage survives updates. Existing contracts retain synchronous PUT and optional If-Match. ESM saves require Idempotency-Key and If-Match carrying the current desired source revision; accepted source advances desired while active remains the last working build. Omitting ui/styles preserves desired values only for ESM; null clears. Successful builds publish automatically; later saves supersede pending builds.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "Required for ESM saves. Reuse the same key, body, target and If-Match after response loss; a changed request with that key returns idempotency_conflict. Use a fresh key for each intentional save.",
        "in": "header",
        "name": "Idempotency-Key",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128,
          "pattern": "^[!-~]+$"
        }
      },
      {
        "description": "Validator \"<N>\" for revision N from desired GET /app/:id/source. Required for ESM saves and migrations; optional for existing-contract PUT. The weak form W/\"<N>\" is also accepted so clients can return the response ETag verbatim.",
        "in": "header",
        "name": "If-Match",
        "required": false,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "module"
        ],
        "properties": {
          "module": {
            "type": "string",
            "description": "Replacement server ES module source. Must export a literal canonical `manifest` and a `routes` array. A route handler returns exactly the value declared by `outputSchema`; for `outputSchema: { type: \"array\", items: ... }`, return the array directly. Charming adds the HTTP transport envelope, so do not add `{ ok, value }` or `{ value }` unless those fields belong to `outputSchema` itself. `default.fetch` is an optional unmatched-request fallback; when absent, Charming supplies a generic 404 handler. Keep the stored contract’s exact schema. ESM source is statically checked and built after acceptance."
          },
          "ui": {
            "type": [
              "string",
              "null"
            ],
            "description": "ESM browser module: omit to preserve desired UI, pass null to clear. Existing-contract PUT retains replacement semantics."
          },
          "styles": {
            "type": [
              "string",
              "null"
            ],
            "description": "ESM: omit to preserve desired styles, pass null to clear."
          },
          "description": {
            "type": [
              "string",
              "null"
            ],
            "description": "Omit to preserve the desired description; pass null to clear."
          },
          "migrate_contract": {
            "type": "boolean",
            "description": "Required as true when changing a stored contract. ESM migration requires the explicit ESM schema, Idempotency-Key and desired-source If-Match; it publishes only after a successful build. Source submissions do not roll back contracts. History can explicitly restore a retained validated existing-contract revision."
          }
        },
        "additionalProperties": false
      },
      "example": {
        "module": "string"
      }
    },
    "response": {
      "description": "Updated",
      "schema": {
        "type": "object",
        "required": [
          "id",
          "manifestId",
          "displayName",
          "url",
          "capabilities",
          "claimed",
          "revision"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "manifestId": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "capabilities": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "imports": {
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "oneOf": [
                    {
                      "enum": [
                        "charming:storage/kv@1.0",
                        "charming:storage/blob@1.0",
                        "charming:logging/emit@1.0",
                        "charming:network/fetch@1.0",
                        "charming:secrets/fetch@1.0",
                        "charming:browser/microphone@1.0",
                        "charming:browser/camera@1.0",
                        "charming:browser/geolocation@1.0",
                        "charming:browser/clipboard-read@1.0",
                        "charming:browser/display-capture@1.0",
                        "charming:browser/midi@1.0",
                        "charming:browser/device-motion@1.0",
                        "charming:browser/ambient-light@1.0",
                        "charming:browser/storage@1.0"
                      ]
                    },
                    {
                      "type": "string",
                      "pattern": "^charming:app/[a-z0-9][a-z0-9-]{0,63}@[0-9]+\\.[0-9]+(?:\\.[0-9]+)?$"
                    }
                  ]
                }
              }
            }
          },
          "icon": {
            "anyOf": [
              {
                "type": "object",
                "description": "Optional home-screen / favicon icon. The server composes a colored rounded-square PNG/SVG from `emoji + bg` — NOT a list of image URLs like a W3C web manifest. Omit it to get the default icon. If `emoji` or `bg` is invalid the whole icon is silently dropped (stored as unset, so the default renders) and the create/update response carries a `warnings[]` entry. This warn-and-drop contract is the `manifest.icon` publish path only (`PUT /app/{id}` and its create counterpart) — `PUT /app/{id}/icon` uses the stricter `IconStrict` schema instead.",
                "required": [
                  "emoji",
                  "bg"
                ],
                "properties": {
                  "emoji": {
                    "type": "string",
                    "description": "A single emoji, rendered centered (e.g. `⚽`). Extra glyphs are dropped."
                  },
                  "bg": {
                    "type": "string",
                    "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
                    "description": "Background color as a hex string (`#rgb`, `#rrggbb`, or `#rrggbbaa`). Named colors (`\"green\"`), `rgb()`/`hsl()`, and image URLs are rejected."
                  }
                },
                "additionalProperties": false
              },
              {
                "type": "null"
              }
            ]
          },
          "claimed": {
            "type": "boolean"
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "example": 4,
            "examples": [
              0,
              4
            ],
            "description": "Server-owned app source revision. New apps start at 1, each successful source write advances it once, and historical null counters project as 0. `If-Match: \"<N>\"` and `expected_revision` carry this revision through its canonical concurrency grammar."
          },
          "warnings": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Non-blocking publish feedback (#1126), present only when static validation found UI/backend contract mismatches. The write succeeded."
          }
        }
      }
    },
    "security": [
      "appToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-app --param id=VALUE --body @body.json"
  },
  {
    "id": "update-app-share",
    "method": "PATCH",
    "path": "/api/v1/apps/{appId}/shares",
    "summary": "Change an existing share’s role by grantee",
    "description": "User-gated (`chrm_user_*` or session); owner only (`app:share`). Re-roles an existing grant or outstanding email invitation; never creates one.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "grantee",
          "role"
        ],
        "properties": {
          "grantee": {
            "type": "string",
            "description": "Handle or email of the grantee."
          },
          "role": {
            "type": "string",
            "enum": [
              "collaborator",
              "end-user",
              "viewer"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "grantee": "string",
        "role": "collaborator"
      }
    },
    "response": {
      "description": "Role changed.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "role"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "collaborator",
              "end-user",
              "viewer"
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-app-share --param appId=VALUE --body @body.json"
  },
  {
    "id": "update-app-share-by-id",
    "method": "PATCH",
    "path": "/api/v1/apps/{appId}/shares/{shareId}",
    "summary": "Change an existing share’s role",
    "description": "User-gated (`chrm_user_*` or session); requires `app:share`. Updates the grant or email invitation addressed by its opaque share id.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "shareId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "role"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "collaborator",
              "end-user",
              "viewer"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "role": "collaborator"
      }
    },
    "response": {
      "description": "Role changed.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "role"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "collaborator",
              "end-user",
              "viewer"
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-app-share-by-id --param appId=VALUE --param shareId=VALUE --body @body.json"
  },
  {
    "id": "update-app-signed-in-access",
    "method": "PATCH",
    "path": "/api/v1/apps/{appId}/signed-in-access",
    "summary": "Update signed-in app access",
    "description": "User-gated (`chrm_user_*` or session). Sets the role granted to signed-in visitors without changing anonymous Viewer access.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "signedInAccess"
        ],
        "properties": {
          "signedInAccess": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "viewer",
              "end-user",
              null
            ]
          }
        }
      },
      "example": {
        "signedInAccess": "viewer"
      }
    },
    "response": {
      "description": "Signed-in access updated.",
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "ok",
          "signedInAccess"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "signedInAccess": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "viewer",
              "end-user",
              null
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-app-signed-in-access --param appId=VALUE --body @body.json"
  },
  {
    "id": "update-app-template-listing",
    "method": "PATCH",
    "path": "/api/v1/apps/{appId}/template-listing",
    "summary": "Update a Template listing draft",
    "description": "User-gated (`chrm_user_*` or session); requires `app:template-edit`. Changes only supplied listing content fields and does not enable, disable, publish, or unpublish the Template.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "appId",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "properties": {
          "title": {
            "type": [
              "string",
              "null"
            ]
          },
          "summary": {
            "type": [
              "string",
              "null"
            ]
          },
          "contentMarkdown": {
            "type": [
              "string",
              "null"
            ]
          },
          "category": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "business",
              "developer-tools",
              "education",
              "entertainment",
              "lifestyle",
              "productivity",
              "utilities",
              null
            ]
          },
          "cover": {
            "oneOf": [
              {
                "type": "object",
                "required": [
                  "assetKey",
                  "alt"
                ],
                "properties": {
                  "assetKey": {
                    "type": "string"
                  },
                  "alt": {
                    "type": "string"
                  },
                  "caption": {
                    "type": [
                      "string",
                      "null"
                    ]
                  }
                },
                "additionalProperties": false
              },
              {
                "type": "null"
              }
            ]
          },
          "gallery": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "assetKey",
                    "alt"
                  ],
                  "properties": {
                    "assetKey": {
                      "type": "string"
                    },
                    "alt": {
                      "type": "string"
                    },
                    "caption": {
                      "type": [
                        "string",
                        "null"
                      ]
                    }
                  },
                  "additionalProperties": false
                }
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {}
    },
    "response": {
      "description": "Updated editable Template listing.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "listing"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "listing": {
            "type": "object",
            "required": [
              "appId",
              "creator",
              "builders",
              "draft",
              "resolved",
              "templateEnabled",
              "listed",
              "validation",
              "publicUrl"
            ],
            "properties": {
              "appId": {
                "type": "string",
                "format": "uuid"
              },
              "creator": {
                "type": "object",
                "required": [
                  "handle"
                ],
                "properties": {
                  "handle": {
                    "type": "string"
                  }
                }
              },
              "builders": {
                "type": "integer",
                "minimum": 0
              },
              "draft": {
                "allOf": [
                  {
                    "type": "object",
                    "required": [
                      "title",
                      "summary",
                      "contentMarkdown",
                      "category",
                      "cover",
                      "gallery"
                    ],
                    "properties": {
                      "title": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "summary": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "contentMarkdown": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "category": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "enum": [
                          "business",
                          "developer-tools",
                          "education",
                          "entertainment",
                          "lifestyle",
                          "productivity",
                          "utilities",
                          null
                        ]
                      },
                      "cover": {
                        "oneOf": [
                          {
                            "type": "object",
                            "required": [
                              "id",
                              "kind",
                              "assetKey",
                              "url",
                              "alt",
                              "caption",
                              "position"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "kind": {
                                "type": "string",
                                "enum": [
                                  "cover",
                                  "screenshot"
                                ]
                              },
                              "assetKey": {
                                "type": "string"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "alt": {
                                "type": "string"
                              },
                              "caption": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              },
                              "position": {
                                "type": "integer",
                                "minimum": 0
                              }
                            }
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "gallery": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "id",
                            "kind",
                            "assetKey",
                            "url",
                            "alt",
                            "caption",
                            "position"
                          ],
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "cover",
                                "screenshot"
                              ]
                            },
                            "assetKey": {
                              "type": "string"
                            },
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "alt": {
                              "type": "string"
                            },
                            "caption": {
                              "type": [
                                "string",
                                "null"
                              ]
                            },
                            "position": {
                              "type": "integer",
                              "minimum": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "object",
                    "required": [
                      "legacyFallback"
                    ],
                    "properties": {
                      "legacyFallback": {
                        "type": "boolean"
                      }
                    }
                  }
                ]
              },
              "resolved": {
                "type": "object",
                "required": [
                  "title",
                  "summary",
                  "contentMarkdown",
                  "category",
                  "cover",
                  "gallery"
                ],
                "properties": {
                  "title": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "summary": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "contentMarkdown": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "category": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "business",
                      "developer-tools",
                      "education",
                      "entertainment",
                      "lifestyle",
                      "productivity",
                      "utilities",
                      null
                    ]
                  },
                  "cover": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "kind",
                          "assetKey",
                          "url",
                          "alt",
                          "caption",
                          "position"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "kind": {
                            "type": "string",
                            "enum": [
                              "cover",
                              "screenshot"
                            ]
                          },
                          "assetKey": {
                            "type": "string"
                          },
                          "url": {
                            "type": "string",
                            "format": "uri"
                          },
                          "alt": {
                            "type": "string"
                          },
                          "caption": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "position": {
                            "type": "integer",
                            "minimum": 0
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "gallery": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "id",
                        "kind",
                        "assetKey",
                        "url",
                        "alt",
                        "caption",
                        "position"
                      ],
                      "properties": {
                        "id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "kind": {
                          "type": "string",
                          "enum": [
                            "cover",
                            "screenshot"
                          ]
                        },
                        "assetKey": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string",
                          "format": "uri"
                        },
                        "alt": {
                          "type": "string"
                        },
                        "caption": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "position": {
                          "type": "integer",
                          "minimum": 0
                        }
                      }
                    }
                  }
                }
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "listed": {
                "type": "boolean"
              },
              "validation": {
                "type": "object",
                "required": [
                  "complete",
                  "missingFields"
                ],
                "properties": {
                  "complete": {
                    "type": "boolean"
                  },
                  "missingFields": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "title",
                        "summary"
                      ]
                    }
                  }
                }
              },
              "publicUrl": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-app-template-listing --param appId=VALUE --body @body.json"
  },
  {
    "id": "update-routine",
    "method": "PATCH",
    "path": "/api/v1/routines/{routineId}",
    "summary": "Update a Routine's interval or enabled state",
    "description": "Session-gated; requires `app:write` on the routine's app. Re-enable is `{enabled: true}` — not a separate action. Re-enabling resets the consecutive-failure counter.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "routineId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "properties": {
          "interval": {
            "type": "string",
            "enum": [
              "hourly",
              "daily",
              "weekly"
            ]
          },
          "enabled": {
            "type": "boolean"
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      },
      "example": {}
    },
    "response": {
      "description": "Routine updated.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "routine"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "routine": {
            "type": "object",
            "description": "A declared op scheduled to run on a timer. The op is invoked with empty input, so it must declare no required input fields.",
            "required": [
              "id",
              "app_id",
              "op",
              "interval",
              "enabled",
              "disabled_reason",
              "next_run_at",
              "last_run_at",
              "last_outcome",
              "last_error",
              "consecutive_failures"
            ],
            "properties": {
              "id": {
                "type": "string",
                "description": "Public id, `routine_<uuid>` form."
              },
              "app_id": {
                "type": "string",
                "format": "uuid"
              },
              "op": {
                "type": "string"
              },
              "interval": {
                "type": "string",
                "enum": [
                  "hourly",
                  "daily",
                  "weekly"
                ]
              },
              "enabled": {
                "type": "boolean"
              },
              "disabled_reason": {
                "type": [
                  "string",
                  "null"
                ],
                "enum": [
                  "owner",
                  "auto",
                  null
                ]
              },
              "next_run_at": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time",
                "description": "`null` while the Routine is disabled — the underlying schedule is preserved and reappears here once re-enabled, with no recomputation."
              },
              "last_run_at": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "last_outcome": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "last_error": {
                "type": [
                  "object",
                  "null"
                ],
                "required": [
                  "kind",
                  "message"
                ],
                "properties": {
                  "kind": {
                    "type": "string"
                  },
                  "message": {
                    "type": "string"
                  }
                }
              },
              "consecutive_failures": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-routine --param routineId=VALUE --body @body.json"
  },
  {
    "id": "update-team-app-defaults",
    "method": "PATCH",
    "path": "/api/v1/teams/{teamId}/app-defaults",
    "summary": "Update team App defaults",
    "description": "User-gated (`chrm_user_*` or session); the caller must be an owner or admin of the team. Changes apply only to later App creates and transfers.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "minProperties": 1,
        "properties": {
          "generalAccessTier": {
            "type": "string",
            "enum": [
              "invited-only",
              "public-view",
              "public-and-signed-in-use"
            ]
          },
          "templateEnabled": {
            "type": "boolean"
          }
        },
        "additionalProperties": false
      },
      "example": {}
    },
    "response": {
      "description": "Defaults updated.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "defaults"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "defaults": {
            "type": "object",
            "required": [
              "teamId",
              "generalAccessTier",
              "templateEnabled",
              "createdAt",
              "updatedAt"
            ],
            "properties": {
              "teamId": {
                "type": "string"
              },
              "generalAccessTier": {
                "type": "string",
                "enum": [
                  "invited-only",
                  "public-view",
                  "public-and-signed-in-use"
                ]
              },
              "templateEnabled": {
                "type": "boolean"
              },
              "createdAt": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "updatedAt": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              }
            }
          }
        }
      }
    },
    "security": [
      "sessionCookie",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-team-app-defaults --param teamId=VALUE --body @body.json"
  },
  {
    "id": "update-team-member",
    "method": "PATCH",
    "path": "/api/v1/teams/{teamId}/members/{memberId}",
    "summary": "Change a team member’s role",
    "description": "Session cookie required. Personal access tokens are not accepted. Only an owner may grant the `owner` role; everything else is the Better Auth org plugin’s gate, relayed verbatim.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "teamId",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "",
        "in": "path",
        "name": "memberId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "role"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          }
        },
        "additionalProperties": false
      },
      "example": {
        "role": "owner"
      }
    },
    "response": {
      "description": "Role changed.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "sessionCookie"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-team-member --param teamId=VALUE --param memberId=VALUE --body @body.json"
  },
  {
    "id": "update-webhook",
    "method": "PATCH",
    "path": "/api/v1/webhooks/{webhookId}",
    "summary": "Rename a Webhook, change its enabled state, or rotate its secret",
    "description": "Session-gated; requires `app:write` on the webhook's app. Re-enable is `{enabled: true}` — not a separate action — and resets the consecutive-failure counter. `{rotate_secret: true}` replaces the secret immediately and returns the new one once. `name` relabels the Webhook.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "webhookId",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "properties": {
          "enabled": {
            "type": "boolean"
          },
          "rotate_secret": {
            "type": "boolean"
          },
          "name": {
            "type": "string",
            "maxLength": 80
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      },
      "example": {}
    },
    "response": {
      "description": "Webhook updated. `secret` is present only after a rotation.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "webhook"
        ],
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "webhook": {
            "type": "object",
            "description": "A declared op an external sender invokes by POSTing to `url` with the Webhook secret. The body is the op’s input.",
            "required": [
              "id",
              "app_id",
              "op",
              "name",
              "url",
              "secret_prefix",
              "enabled",
              "disabled_reason",
              "last_run_at",
              "last_outcome",
              "last_error",
              "consecutive_failures"
            ],
            "properties": {
              "id": {
                "type": "string",
                "description": "Public id, `webhook_<uuid>` form."
              },
              "app_id": {
                "type": "string",
                "format": "uuid"
              },
              "op": {
                "type": "string"
              },
              "name": {
                "type": "string",
                "description": "The owner’s label; defaults to the op’s title, description, or identifier."
              },
              "url": {
                "type": "string",
                "description": "The delivery URL an external sender POSTs to."
              },
              "secret_prefix": {
                "type": "string",
                "description": "First characters of the secret, for matching a stored copy by eye."
              },
              "enabled": {
                "type": "boolean"
              },
              "disabled_reason": {
                "type": [
                  "string",
                  "null"
                ],
                "enum": [
                  "owner",
                  null
                ]
              },
              "last_run_at": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "last_outcome": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "last_error": {
                "type": [
                  "object",
                  "null"
                ],
                "required": [
                  "kind",
                  "message"
                ],
                "properties": {
                  "kind": {
                    "type": "string"
                  },
                  "message": {
                    "type": "string"
                  }
                }
              },
              "consecutive_failures": {
                "type": "integer"
              }
            }
          },
          "secret": {
            "type": "string",
            "description": "Present only when the update rotated the secret. Shown once."
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request update-webhook --param webhookId=VALUE --body @body.json"
  },
  {
    "id": "upload-app-asset",
    "method": "POST",
    "path": "/app/{id}/assets",
    "summary": "Upload an asset for an app",
    "description": "Multipart upload of a single file asset. Auth posture: `requireAppAccess` (app token, user token, render token, or claim cookie). Hard caps: 10 MiB/asset, 50 assets/app, 100 MiB/app total.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "multipart/form-data",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "key",
          "file"
        ],
        "properties": {
          "key": {
            "type": "string",
            "description": "Asset key (filename). Must be non-empty and valid."
          },
          "file": {
            "type": "string",
            "format": "binary",
            "description": "File bytes. Max 10 MiB."
          }
        }
      },
      "example": {
        "key": "string",
        "file": "string"
      }
    },
    "response": {
      "description": "Asset uploaded.",
      "schema": {
        "type": "object",
        "required": [
          "ok",
          "key",
          "url",
          "sizeBytes"
        ],
        "description": "Confirmation that an asset was stored, with a signed URL for direct access.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "key": {
            "type": "string"
          },
          "url": {
            "type": "string",
            "description": "Signed URL for direct access."
          },
          "sizeBytes": {
            "type": "integer"
          }
        }
      }
    },
    "security": [
      "appToken",
      "renderToken",
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 20000,
    "usage": "charming api request upload-app-asset --param id=VALUE --body '{\"key\":\"name\"}' --file FILE"
  },
  {
    "id": "upsert-app-secret",
    "method": "PUT",
    "path": "/app/{id}/secrets",
    "summary": "Create or replace a secret value",
    "description": "Owner-only, write-only. Stores an encrypted secret value under a name, replacing any existing secret with the same name. The name must match `^[A-Z][A-Z0-9_]*$` (the same charset a `{{secret:NAME}}` reference uses, so a settable name is always referenceable); values are capped at 8 KiB. The value is never echoed back. Requires the owner's user token; app/render tokens are rejected.",
    "parameters": [
      {
        "description": "",
        "in": "path",
        "name": "id",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "requestBody": {
      "mediaType": "application/json",
      "required": true,
      "schema": {
        "type": "object",
        "required": [
          "name",
          "value"
        ],
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Z][A-Z0-9_]*$",
            "description": "Env-var-shaped secret name (referenceable via `{{secret:NAME}}`)."
          },
          "value": {
            "type": "string",
            "maxLength": 8192,
            "description": "Plaintext secret value (max 8 KiB). Stored encrypted; never returned."
          }
        }
      },
      "example": {
        "name": "string",
        "value": "string"
      }
    },
    "response": {
      "description": "Secret stored.",
      "schema": {
        "type": "object",
        "required": [
          "ok"
        ],
        "description": "Minimal success acknowledgement. `ok: true` confirms the mutation landed.",
        "properties": {
          "ok": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    },
    "security": [
      "userToken"
    ],
    "streaming": false,
    "timeoutMs": 10000,
    "usage": "charming api request upsert-app-secret --param id=VALUE --body @body.json"
  }
] as const;
