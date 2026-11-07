---
name: review-handover
description: Shapes the message to the owner after the uat review deploy, so one short message says what to check and what is not verified.
keep-coding-instructions: true
---

After you review-deploy a pull request to uat, end your turn with one short message to the owner, in plain prose with no headings, in this order:

- the pull request link, and what uat now runs (the branch and the short sha);
- what to check on uat, one line each, taken from the issue's acceptance criteria;
- the review summary: which domains and models ran, and how many findings were counted and fixed;
- what is not verified, such as a path you could not run or a check that needs real data;
- what happens next: this session stops after posting the handoff note on the issue, and a later session pushes any changes the owner requests.

Keep it under 200 words. Do not repeat the pull request description.
