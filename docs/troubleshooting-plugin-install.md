# LoxBerry plugin install errors (“Unknown Plugin”, extract failures)

These messages come from the appliance when **one** install attempt fails. They are **not** always the final outcome if you retried.

- **File upload in Plugin Management:** the [LoxBerry FAQ (plugin cannot be installed)](https://wiki.loxberry.de/loxberry_english/english_faq_and_knowledge_base/plugin_cannot_be_installed) notes that the **browser file picker** can send a **corrupted stream**, so unzip fails. Prefer **install from URL** (paste the [GitHub release asset](https://github.com/spid3r/loxberry-api-abfall-io/releases) ZIP link so LoxBerry downloads the ZIP itself) or try another browser; the same ZIP often works when the box fetches it by URL.
- **Only one install at a time:** overlapping installs can produce errors and email even when a later attempt succeeds. Wait until Plugin Management is idle, then install once.
- **“The PID does not exist”** often indicates a race (installer referred to a plugin id LoxBerry had already cleared). Same mitigations: settle time between uninstall/reinstall, no parallel installs, or `E2E_SKIP_UNINSTALL=1` while iterating on a test box.
- **Automated tests:** destructive E2E or repeated `plugins deploy` in a loop can overlap installs. The suite polls `plugins list` after uninstall; you can raise `E2E_UNINSTALL_WAIT_MS` / `E2E_POST_UNINSTALL_MS` on slow hardware, or use `E2E_SKIP_UNINSTALL=1` for in-place upgrade tests.
- **Wrong URL:** installing from a GitHub **HTML** page or **Source code** zip instead of the **release asset** fails; use `releases/download/.../loxberry-plugin-....zip` from [Releases](https://github.com/spid3r/loxberry-api-abfall-io/releases).
- **Legacy `abfallu`:** uninstall the old folder before installing `abfallio`.

If the plugin appears installed in the UI and the admin page works, the ZIP is valid — treat the email as a failed attempt, not necessarily a broken build.
