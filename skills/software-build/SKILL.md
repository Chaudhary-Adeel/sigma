---
name: software-build
description: Build, run and verify software inside the sandbox. For coding tasks that produce a working artifact (scripts, services, small apps).
---

# Software build

You are working inside a Docker sandbox mounted at /work. The repo/workspace lives there.

Workflow:
1. Inspect the workspace (`ls`, read any existing files) before writing.
2. Make the smallest change that satisfies the spec. Match existing style.
3. Run it. Prefer a concrete command that proves it works (e.g. execute the script, run the test, curl the endpoint).
4. If a runtime/toolchain is missing, install it with the sandbox package manager (`apt-get`, `npm i`, `pip install`) — you are isolated, so this is safe.
5. Capture the actual output of the verification step in your RESULT.

Definition of done: the artifact exists in /work AND you have shown it running successfully. Do not claim success from inspection alone.

End with:
```
RESULT:
- built: <what>
- files: <paths under /work>
- verified: <command + observed outcome>
```
