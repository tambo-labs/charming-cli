# usecharming

## 0.1.2

### Patch Changes

- [#6201](https://github.com/tambo-ai/charming/pull/6201) [`8d0391e`](https://github.com/tambo-ai/charming/commit/8d0391ef5b691e3a39318bfc3b267304e57bdb97) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Redact a `chrm_render_v2.<payload>.<sig>` token whole in command output. The scrubber's trailing character class excluded the dot, so a dotted render envelope lost its prefix and kept its signed payload and signature in anything the CLI printed.
