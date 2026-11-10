# Set up a role

Select a role on the left. Each block has **View** and **Manage**. Manage groups creation, editing and deletion; expand Different permissions when their saved conditions differ. They stay unchanged until a common condition is chosen.

## Viewing opens the contents

Viewing a project opens all its processes, tasks, subtasks, milestones and resource assignments. Viewing a process opens everything inside it. Viewing a task opens its subtasks and assignments.

**A child denial cannot cancel viewing inherited from a parent**, including an individual employee denial. If the parent is fully open, its content's View controls are disabled. With scoped parent access, Through parent only removes an additional grant while keeping inherited visibility.

**Through parent only means No access with an exception:** it removes a separate viewing grant, but an object remains visible inside an accessible parent project, process or task. For example, a task is visible when its containing process or project is accessible; if neither is accessible, this setting does not grant access to the task. Parent means the containing object, not the employee’s manager. Parent-derived viewing always applies: this button neither enables nor disables inheritance. To restrict that viewing, change the parent permissions. Creation, editing and deletion are configured separately.

This applies only to viewing. Seeing an entire project does not grant permission to edit it or manage its contents.

## Main conditions

- **All** covers any objects.
- **In employee-owned projects** checks the project owner, regardless of process or task owners.
- **In employee-owned processes** checks the process owner, regardless of task owners.
- **Own** checks ownership of the project or resource itself.
- **Containing employee-owned processes** opens projects containing an employee's process. Owning a task alone does not qualify. A project opened this way becomes fully visible.

Selected conditions use OR. Peer and other complex conditions are no longer offered. Previously saved special rules remain visible separately and stay effective until explicitly replaced.

## Predefined roles

- **Project director** views all planning and changes project priorities. Other changes are forbidden.
- **Project manager** manages owned projects and all their contents, regardless of nested owners. Does not manage resources.
- **Process owner** manages owned processes and resources. Projects containing their processes are fully visible; other processes remain read-only.
- **Worker** has no initial permissions.
- **Administrator** has full access.

Resource assignment always requires matching resource and process owners, for every role. Project managers may read resources belonging to process owners in their projects for assignment; process owners manage those resources. A regular user's resource header shows only their own resources.

Projects have a separate **Change priority** permission. It does not allow changing names, dates or owners.

New custom roles initially access owned projects and resources, manage processes in owned projects and tasks in owned processes. Assignments default to owned resources in owned tasks; matching resource and process owners remains mandatory. Viewing follows the inheritance rule above.

**Save** applies changes. **Cancel** restores saved values. A role applies to all its employees; individual settings may change additional permissions but cannot cancel parent-derived viewing.

Locked controls are muted and labelled as inherited viewing. Hover over their group for the reason and how to change access: edit the parent project or process View permission. Reset all to defaults is in the page header; the unsaved-changes panel contains only Save and Cancel.
