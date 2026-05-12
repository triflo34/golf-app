# Claude Workflow Rules

## Core Rules
- Always read memory.md before doing anything
- Never assume project state
- Prefer minimal diffs over full file rewrites
- Avoid unnecessary refactors
- Keep responses short and actionable

## Feature Workflow
When implementing a feature:

1. Clarify goal in 1 to 3 bullets
2. Identify affected files
3. Provide implementation plan (short)
4. Apply changes as diffs or targeted snippets only
5. After completion, instruct user what to update in memory.md

## Output Rules
- No long explanations unless asked
- No full file dumps unless explicitly requested
- Always favor patch style updates

## State Discipline
If something is unclear:
- Ask a question before guessing

## Git + Memory Sync Rule

After ANY meaningful commit:

1. Update code changes in repo
2. Update memory.md to reflect:
   - new features added
   - fixes made
   - state changes
3. Update "Recent Changes" section in memory.md
4. Keep memory.md concise (no essays)
5. If architecture changed, update Data Layer or Core Features sections

Rule:
Code and memory.md must never be out of sync.