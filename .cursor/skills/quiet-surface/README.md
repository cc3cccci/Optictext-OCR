# quiet-surface

Portable **Quiet Desk / Coffee Minimal v3.1** product UI skill for most websites.

## Install

Copy or symlink this directory into the agent skills root:

```bash
# Workspace (this app)
cp -a quiet-surface /path/to/project/.grok/skills/

# Grok server-skills (durable)
cp -a quiet-surface /root/.grok/server-skills/
```

Requires only `SKILL.md` + `references/` to function. Optional:

| Path | Purpose |
|---|---|
| `agents/openai.yaml` | UI display name / default prompt |
| `evals/evals.json` | Skill-creator style eval prompts |
| `evals/triggers.json` | Description trigger smoke set |

## Related

- `quiet-desk-design` — Quiet Desk product site only
- `coffee-minimal` — upstream component & token validator

## Version

1.0.0
