# usecharming

## 0.1.3

### Patch Changes

- [#6243](https://github.com/tambo-ai/charming/pull/6243) [`eea25dc`](https://github.com/tambo-ai/charming/commit/eea25dc90c0a1810d3679f2d5245e984946a67a5) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - `POST /api/v1/teams` now refuses with `403 plan_required` (`feature: "teams"`) unless the caller's plan includes teams. Teams come with the Business plan and are set up with Charming through the operator API. The plan refusal's `feature` field gains `teams`.

## 0.1.2

### Patch Changes

- [#6201](https://github.com/tambo-ai/charming/pull/6201) [`8d0391e`](https://github.com/tambo-ai/charming/commit/8d0391ef5b691e3a39318bfc3b267304e57bdb97) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Redact a `chrm_render_v2.<payload>.<sig>` token whole in command output. The scrubber's trailing character class excluded the dot, so a dotted render envelope lost its prefix and kept its signed payload and signature in anything the CLI printed.
