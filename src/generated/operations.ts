// Generated from apps/docs/openapi.fallback.json by @hey-api/openapi-ts. Run `bun run cli:gen`.
export const generatedOperations = [
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
    "summary": "Call an operation defined inside the app's `fetch` handler",
    "description": "External callers must use Bearer auth. The platform strips `/app/<id>` so the app sees `/api/<operation>`. App authors should follow the `{ ok, value | error }` JSON contract. The in-page UI uses `renderToken` automatically via the runtime closure — direct callers should use `appToken` or `userToken`.",
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
        "type": "object"
      }
    },
    "response": {
      "description": "Whatever the app returns. The conventional shape is `{ ok, value }`.",
      "schema": {
        "type": "object",
        "description": "Pass-through body returned by the app’s `fetch` / route handler. Apps SHOULD follow the `{ ok: true, value }` / `{ ok: false, error: { kind, message } }` envelope, but the shape is author-defined.",
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
    "id": "create-app",
    "method": "POST",
    "path": "/app",
    "summary": "Create an app (anonymous or authenticated upsert)",
    "description": "Anonymous callers get a fresh app row with a `chrm_app_*` token in the response. Authenticated callers (`chrm_user_*` or session) upsert by `(userId, manifestId)` — second POSTs with the same `manifest.id` overwrite the existing row in place and the response includes the same `id`. Use `PUT /app/{id}` for deliberate updates against a known id. Pass `pair: true` to mint a bound device_code in the same call.",
    "parameters": [],
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
            "description": "ES module source. Must export a literal canonical `manifest` and a `routes` array. `default.fetch` is an optional unmatched-request fallback; when absent, Charming supplies a generic 404 handler."
          },
          "ui": {
            "type": "string",
            "description": "Optional inline JS program (classic script, not a module). Populates `#app`."
          },
          "styles": {
            "type": "string",
            "description": "Optional CSS injected alongside `ui`."
          },
          "pair": {
            "type": "boolean",
            "description": "Anonymous POST only — silently ignored on authenticated upserts. When true, server mints a bound device_code alongside the app token; user-claim auto-approves the pairing and the agent ends up with both an app token and a `chrm_user_*`."
          },
          "label": {
            "type": "string",
            "maxLength": 80,
            "description": "Anonymous POST only — silently ignored on authenticated upserts. Human-readable label for the agent, surfaced to the user on the `/pair` approval page when `pair: true`."
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
                "description": "Optional home-screen / favicon icon. The server composes a colored rounded-square PNG/SVG from `emoji + bg` — NOT a list of image URLs like a W3C web manifest. Omit it to get the default brick. If `emoji` or `bg` is invalid the whole icon is silently coerced to the default and the create/update response carries a `warnings[]` entry.",
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
    "id": "create-token",
    "method": "POST",
    "path": "/api/token",
    "summary": "Mint a personal access token (`chrm_user_*`)",
    "description": "Plaintext returned exactly once. 7-day TTL. The legacy `/token` path 308s here.",
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
    "id": "get-app-activity",
    "method": "GET",
    "path": "/app/{id}/activity",
    "summary": "Read the app's durable runtime-failure events",
    "description": "Owner-only. Returns the app's own `api_proxy_result`, `diag_report` (runtime JS errors, CSP violations), and `contract_validation` events from durable storage — use this after publishing to learn what broke at runtime. Unlike `GET /app/{id}/diag` (in-memory ring buffer, lost on deploy), these rows survive deploys. Requires the app token or the owner's user token; render tokens and claim cookies are rejected. Not to be confused with `GET /app/{id}/events`, the live-state SSE stream.",
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
        "description": "Comma-separated subset of `api_proxy_result,diag_report,contract_validation`. Unknown kinds are a 400.",
        "in": "query",
        "name": "kinds",
        "required": false,
        "schema": {
          "type": "string"
        }
      },
      {
        "description": "ISO-8601 cutoff; only events at or after this instant are returned.",
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
              "items"
            ],
            "properties": {
              "items": {
                "type": "array",
                "description": "Newest-first durable runtime-failure events for this app. Bounded by per-kind insert caps and a 90-day retention window.",
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
                        "diag_report",
                        "contract_validation"
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
    "id": "get-app-agent-descriptor",
    "method": "GET",
    "path": "/app/{id}/agent.json",
    "summary": "Get an app's agent description without changing the app",
    "description": "Side-effect-free sibling of the page gate: no auto-claim, no token mint, no cookie, no mutating telemetry. A public or remixable app returns the full descriptor to anyone, with `operations[].input`/`output`/`examples` gated on `app:read` (owner, accepted share grant, team membership, or a bearer token) — an anonymous caller sees discovery-level operation fields only. A private app returns the full descriptor only to a caller who already holds `app:read`; everyone else — including an unclaimed app's claim-cookie holder, which grants `app:run` but never `app:read` — gets the minimal stub (`AppDescriptorStub`). Reachable via both the `/app/{id}` UUID form and the `/{handle}/{app-name}` friendly form (byte-identical `id` + `canonical_url`), and advertised from the served page's `<link rel=\"alternate\" type=\"application/json\">` and matching `Link:` HTTP header.",
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
    "description": "Returns the stored `module`, `ui`, and `styles` exactly as persisted, plus the required server revision and contract-aware metadata. Requires a real bearer token for the app or its owning user; render tokens and claim cookies are rejected. The `ETag: \"<N>\"` header carries revision N; pass it back as `If-Match` on PUT or PATCH to gate optimistic concurrency.",
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
            "const": "https://charm.ing/schema/app-manifest/2026-07-31.json",
            "description": "Exact dated schema URL for canonical and migrated apps. Legacy source responses omit this field."
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
    "description": "Returns the RFC 8414 authorization-server metadata document for the Charming auth surface. Consumed by MCP clients during the OAuth handshake. The base payload shape is owned by better-auth; Charming splices a WorkOS-style `agent_auth` extension block carrying `register_uri` (`/api/pair/start`), `claim_uri` (`/app/{id}/claim`), `revocation_uri` (`/api/token/{id}`), `skill` (`https://usecharming.com/auth.md`), `identity_types_supported` (`[\"anonymous\"]`), and an `anonymous` sibling block.",
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
    "id": "get-oauth-protected-resource",
    "method": "GET",
    "path": "/.well-known/oauth-protected-resource",
    "summary": "OAuth protected-resource metadata (delegated to better-auth)",
    "description": "Returns the RFC 9728 protected-resource metadata for the Charming API origin. Pointed at by the `WWW-Authenticate` header MCP returns on 401s so clients can discover the matching authorization server.",
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
    "id": "patch-app-source",
    "method": "PATCH",
    "path": "/app/{id}/source",
    "summary": "Apply exact-string find/replace edits to the persisted source",
    "description": "Applies an `edits[]` array to the stored `module` / `ui` / `styles` buckets. Each edit names a `bucket`, an exact `old_string` to match, and a `new_string` replacement. Requires `If-Match: \"<N>\"` carrying revision N from a fresh source response or ETag. A stale value returns 412 and surfaces the current ETag. Same auth as PUT.",
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
        "description": "Strong validator `\"<N>\"` returned by a fresh GET /source, where N is its revision.",
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
        "properties": {
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
    "id": "set-app-public",
    "method": "PUT",
    "path": "/app/{id}/public",
    "summary": "Toggle whether anyone can open the app with no login",
    "description": "Owner-only. When `public: true`, anyone opening `/app/{id}` with no login is granted read+run against the app's SHARED owner-scope storage — every anonymous visitor reads and writes the SAME data pool (no per-visitor isolation), so anyone with the URL can overwrite or wipe the data. Use it for a totally-open surface (a poll, an RSVP list); for per-person access that requires login, share with the `end-user` role instead. When `public: false`, the URL requires login again; data already written by anonymous visitors is retained. Idempotent: a repeated call with the current state is a no-op.",
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
            "description": "Public URL when `public: true` (friendly `/{handle}/{app-name}` form when available, `/app/{id}` otherwise). Anyone can open it with no login and read+write the shared data. `null` when `public: false`."
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
    "summary": "Toggle whether visitors auto-fork their own copy of the app",
    "description": "Owner-only. When `remixable: true`, any visitor (signed in or anonymous) opening `/app/{id}` is auto-forked into a fresh editable copy. When `remixable: false`, the share URL stops auto-forking; existing remixes (independent anon rows) are unaffected. Idempotent: a repeated call with the current state is a no-op.",
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
          "public_url"
        ],
        "description": "New remixable state plus the shareable URL when remixable is true.",
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
    "description": "Owner-only. When non-null, the authored text leads the prompt body for the \"Open in Claude / Open in ChatGPT / Copy prompt\" control-panel actions, and the app's name, description, URL (and, for unclaimed apps, an access token) are appended automatically at render time. Write a generic getting-started instruction — do NOT embed the app's URL, or every remixer's deeplink would point at the template instead of their own copy. Pass `null` (or an empty string) to clear and revert to the generic default. Idempotent: a repeated call with the same value is a no-op.",
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
    "id": "update-app",
    "method": "PUT",
    "path": "/app/{id}",
    "summary": "Update an existing app",
    "description": "Storage survives updates. Optional `If-Match: \"<N>\"` carries revision N from a fresh GET /source response or ETag and gates the write with optimistic concurrency. When present and stale, the response is 412 with the current ETag. Omitting `If-Match` keeps unguarded PUT semantics.",
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
        "description": "Optional strong validator `\"<N>\"` from a fresh GET /app/:id/source. N carries the server revision, and the PUT succeeds only when it still matches.",
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
            "type": "string"
          },
          "ui": {
            "type": "string"
          },
          "styles": {
            "type": "string"
          },
          "migrate_contract": {
            "type": "boolean",
            "description": "Required as true when replacing stored legacy source with a complete valid canonical manifest and routes array. Migration is one-way."
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
                "description": "Optional home-screen / favicon icon. The server composes a colored rounded-square PNG/SVG from `emoji + bg` — NOT a list of image URLs like a W3C web manifest. Omit it to get the default brick. If `emoji` or `bg` is invalid the whole icon is silently coerced to the default and the create/update response carries a `warnings[]` entry.",
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
