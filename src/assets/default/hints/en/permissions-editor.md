# User permissions

A role supplies initial permissions. Individual settings add grants or remove separate role permissions. They remain when the role changes, until explicitly reset.

**Viewing inherits downward:** a project opens all processes, tasks, subtasks, milestones and assignments; a process opens its contents; a task opens its subtasks and assignments. An individual child denial **cannot cancel** parent-derived viewing. View controls are disabled when the parent is fully open. Through parent only removes an additional grant while preserving inherited access.

**Through parent only means No access with an exception:** it removes a separate viewing grant, but an object remains visible inside an accessible parent project, process or task. For example, a task is visible when its containing process or project is accessible; if neither is accessible, this setting does not grant access to the task. Parent means the containing object, not the employee’s manager. Parent-derived viewing always applies: this button neither enables nor disables inheritance. To restrict that viewing, change the parent permissions. Creation, editing and deletion are configured separately.

Management does not inherit: creation, editing and deletion are checked separately. Seeing a colleague's process does not permit editing it.

Main conditions are **All**, **In employee-owned projects**, **In employee-owned processes**, and owned projects or resources. Nested records may have different owners. The project condition **Containing employee-owned processes** requires an owned process, not merely a task; the whole project then becomes visible.

Selected conditions use OR. Peer and other complex conditions are no longer offered; previously saved conditions remain visible and effective until replaced.

Projects have a separate **Change priority** permission, which does not grant other field changes. Resource assignments always require matching resource and process owners, including for administrators. Managing resources is separate from managing assignments.

**Save** applies changes. **Reset individual permissions** restores the role's permissions. Administrators always have full access.

Locked View controls are muted. Hover over their group for an explanation: change access on the parent instead of adding an ineffective child denial.

The user page uses two columns, or one on narrow screens. Manage sets a common condition for creation, editing and deletion. Different permissions reveals the saved conditions; they stay unchanged until a common value is selected. Use role settings removes individual overrides only for the selected action group.

Role changes are saved immediately. Save and Cancel in the changes panel apply to individual permissions. Reset individual permissions in the header prepares a return to role settings: select Save to apply or Cancel to restore the last saved overrides. A rejected save keeps the draft available for correction.
