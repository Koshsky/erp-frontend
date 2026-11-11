# User access rights

A user's rights: the base ones — from the preset (in the block header), below — individual edits per row (resource + action).

- The buttons in a row — which records the right applies to; you can select several at once.
- "⛔ deny" — close an action; a second click returns it to the preset.
- "Reset individual" — return everything to the preset.

What the buttons mean:

```
Project → Process → Task → subtasks
```

Everything inside a record is its descendants, everything outside (the project for a task, etc.) — its ancestors. Every record has an owner. A rule grants access if you are the owner of the record itself, of an ancestor of it, or of a record inside it.

Buttons:

1. "Own" (self) — you are the owner of the record. Example: "tasks = Own" — only your tasks.
2. "Parents" (up1) — you are the owner of its immediate parent. Example: "tasks = Parents" — tasks of your processes.
3. "Ancestors" (up) — you are the owner of any ancestor. Example: "tasks = Ancestors" — tasks of your processes and projects.
4. "Siblings" (sib) — neighboring records under the same parent. Example: "processes = Siblings" — all processes of your project.
5. "Subtree" (down) — there is one of your records inside the record. Example: "projects = Subtree" — projects that contain your tasks.
6. "All" (all) — the whole catalog. "⛔" — deny.

"Tasks = Ancestors" and "projects = Subtree" are different rules: the former gives the tasks of your projects, the latter the projects with your tasks.

Combine the buttons: "Own" + "Siblings" = your own and neighboring ones. "All" and "⛔" — separately (they reset the rest). Milestones and assignments have no "Own"/"Siblings"/"Subtree"; a project has no "Parents"/"Ancestors"/"Siblings".