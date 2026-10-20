# Palette-to-token follow-up: devices

Based only on prepare/v1-theme-core, not on lint or the general test floor.
Replays the palette-only string changes from ce78c98 onto current upstream 5970401 without copying old files or reformatting surrounding code. Upstream v0.74/v0.75 behaviour is retained. New upstream views absent from that historical migration remain outside this slice and need a fresh v1.0 gap review.

This branch changes only the devices UI-area class strings. No auth/backend, images, scanners, coverage policy or lint floor. The siblings are separate follow-ups on the same core, not prerequisites for core. Validate each branch and the combined result before proposing. Source attribution and LICENSE retained.
