---
name: gmail-triage
description: Triage and act on email via the Gmail connector. For inbox-summary, follow-up, and draft/send tasks.
---

# Gmail triage

Tools: `gmail_list` (with Gmail search queries), `gmail_get` (read body), `gmail_send`.

- Start narrow: use a query like `is:unread newer_than:2d` or `from:someone` rather than listing everything.
- Read a message body only when the subject/sender is not enough to act.
- When summarizing, group by sender or topic and keep each item to one line.
- Before sending, restate recipient + subject in your RESULT so the user can confirm.
- Never send unless the task explicitly asks you to send. Default to drafting the text and reporting it.
