# Optional surface schemes

Follow-up to prepare/v1-theme-core only; independent of lint/general-test floors.
High contrast strengthens neutral ink and borders in Light and Dark. Midnight deepens dark surfaces and does nothing in Light. The scheme persists separately from accent and follows System's effective mode. Default removes data-scheme and retains upstream neutral tokens.
DOM and Chromium regressions cover persistence, live OS changes, mobile fit and muted-text contrast on the darkest card. Reconcile after v1.0 before proposing. Source bbe276f; no backend, images, scanners or legacy login.
