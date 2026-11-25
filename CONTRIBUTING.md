# Contributing to hike-recap

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting issues

- **Questions, ideas, possible bugs**: the [Discord forum](https://discord.kirch.dev/).
- **Confirmed bugs**: a [bug report](https://github.com/TitusKirch/hike-recap/issues/new?template=bug_report.yml), with a minimal reproduction where possible.
- **Feature requests**: a [feature request](https://github.com/TitusKirch/hike-recap/issues/new?template=feature_request.yml).
- **Security vulnerabilities**: never a public issue — follow [SECURITY.md](SECURITY.md).

## Setup

Node **24+** and **pnpm 12**, then:

```bash
git clone https://github.com/TitusKirch/hike-recap.git
cd hike-recap
pnpm install   # also wires the husky hooks
```

Commands and repo conventions live in [AGENTS.md](AGENTS.md). Before you push, `pnpm check` and `pnpm test` must pass — CI runs the same gate and renders the example. `pnpm check:fix` repairs lint and formatting.

## Branches and commits

- **Branch off `dev` and target `dev`.** `main` only receives the promotion from `dev`.
- **Conventional Commits**, enforced by commitlint; a breaking change takes `!` or a `BREAKING CHANGE:` footer.
- **One concern per PR**, docs updated alongside the change.
- **Never `--no-verify`.** If a hook fails, fix the cause and commit again.

## Agent instructions

`AGENTS.md` is the only agent instruction file. Claude Code reads it itself from v2.1.277 on — as long as no `CLAUDE.md` or `CLAUDE.local.md` sits in the working directory or above it, so don't add one.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
