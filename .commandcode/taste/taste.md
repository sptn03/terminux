# Taste Profile

## Communication
- Writes in Vietnamese (often typed without diacritics) and expects replies in Vietnamese. Confidence: 0.85
- Gives short, run-on, informal instructions ("...cho nao text bi thua hoan thien lai cac phan loi fix di") and expects the agent to infer the full task list rather than ask for clarification. Confidence: 0.7

## Engineering Standards
- Wants features actually completed and working — no stubs, no dead buttons, no fake/demo/hardcoded values presented as real data. Confidence: 0.8
- Dislikes redundant or leftover text (duplicate labels/paragraphs, unused imports, placeholder copy) and expects it cleaned up as part of the task. Confidence: 0.75
- Expects "fix" to mean real root-cause fixes (e.g. a disconnect that never flips state, a shell regex silently broken by a JS template literal), not surface patches. Confidence: 0.65
