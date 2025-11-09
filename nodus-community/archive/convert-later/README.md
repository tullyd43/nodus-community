# Archive: convert-later

This directory contains legacy and "convert later" JavaScript sources that were moved out of the active project tree to reduce noise and simplify ongoing maintenance.

Why archived

-   These files reference enterprise-only shims such as `SafeDOM` and `ForensicLogger`.
-   They are not required for the community build or for the current dev flow.

Where they came from

-   Original location (before archiving): repository root `convert later/`.

What to do next

-   If you need to resurrect any code here, copy the specific file(s) into `src/` and update imports as needed.
-   Consider a future cleanup pass to extract useful components and port them into `src/` with removed enterprise dependencies.

Notes

-   This archive was created automatically by a cleanup script. No code was deleted; everything was moved intact.
-   Date archived: 2025-11-08
-   Archived by: repository cleanup
